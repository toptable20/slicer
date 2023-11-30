require('dotenv').config();
const Koa = require('koa');
const cors = require('@koa/cors');

const fs = require('fs');

const opentype = require('opentype.js');
const { stringToGeometry, geometryToSTL } = require('./TextMaker');
const {CuraWASM} =require('cura-wasm');
const {resolveDefinition}= require('cura-wasm-definitions');
const { log } = require('three');
const {koaBody} = require('koa-body'); 

const port = process.env.PORT || 4000;

const app = new Koa();

// const validOrigins = ["http://trid.ctr-it.com", "http://foodian.co.kr", "http://localhost:80", "http://localhost:8080"];
const validOrigins = ["http://trid.ctr-it.com", "http://foodian.co.kr"];

function verifyOrigin ( ctx ) {
  const origin = ctx.headers.origin;
  if ( !originIsValid( origin )) return false;
  return origin;
}

function originIsValid ( origin ) {
  return validOrigins.indexOf( origin ) != -1;
}

app.use(cors({
  origin: verifyOrigin,
  methods: ['POST'],
}));

app.use(
  koaBody({
    multipart: true, // 파일 업로드 활성화
    formidable: {
      // formidable 옵션 설정
      keepExtensions: true, // 파일 확장자 유지
    },
  })
  ); 

app.use(async ctx =>  {
  const { filename = 'myfile' } = ctx.request.body;
  let tmp ='';

  switch(ctx.request.body.product_type)
  {
    case 'iinkV1':
      tmp = await this.iinkGcodeGenerateV1(ctx.request.body);
      break;
    case 'iinkV2':
      tmp = await this.iinkGcodeGenerateV2(ctx.request.body);
      break;
    case 'iinkV3':
      tmp = await this.iinkGcodeGenerateV3(ctx.request.body);
      break;
    case 'api':
      tmp = await this.apiGcodeGenerate(ctx.request);
      break;
    case 'goyooV2':
      tmp = await this.goyooGcodeGenerateV2(ctx.request.body);
      break;
    default:
      tmp = await this.goyooGcodeGenerate(ctx.request.body);
      break;
  }

  ctx.response.set("content-disposition", `attachment; filename=${filename}.gcode`);
  ctx.statusCode = 200;
  ctx.body = Buffer.from(tmp)

});

exports.goyooGcodeGenerate = async (body) => {
  const {
    product_type = 'goyoo',
    font = "ChosunGu.ttf",
    message = "예뷔퓨미혜햬",
    hole=false,
    zoffset = 0,
    size = 10,
    initial_layer_flow = 200,
    layer_height = 0.6,

    retraction_speed = 120,
    retraction_distance = 30,
    retaraction_minimum_travel = 1.0,
    travel_speed = 350,
    initial_layer_travel_speed = 350,
    initial_layer_height = 0.45,

    start_code = 'G21\nG90\nG28\nG1 F5000 Z3.0\nG92 E0 Z0\nG1 E20\nG92 E0',
    next2_outer_wall_code = 'G1 E+1.22\nG92 E0\n',
    end_code ='G90\nG1 F8000 Z+5 E-50\nG1 X0 Y0\nG28\nG980\nM84',

    retraction_hop_enabled = false,
    retraction_hop = 1,

    print_speed = 30.0,
  } = body;

  const definition = resolveDefinition('custom');
  const slicer = new CuraWASM({
    definition,
    overrides: [
      { key: 'layer_height', value: layer_height }, //가변필요 //stl의 높이에따라 가변되어야함 즉 글자stl의 사이즈가 변경되면 정비례하게 변경되어야함 자세한건 후술 cli 에서는 옵션이 안먹어서 설정파일을 수정했으나 wasam에서는 동작함 이거에 따라 레이어 갯수가 결정됨 레이어갯수 = 실제 모델 높이 / layer_height

      { key: 'wall_line_count', value:1  },

      { key: 'material_print_temperature', value:0  }, //초기 프린트 온도 설정
      { key: 'material_print_temperature_layer_0', value:0  }, //초기 레이어 프린트 온도 설정
      { key: 'material_initial_print_temperature', value:0  }, //시작 프린트 온도 설정 
      { key: 'material_final_print_temperature', value:0  },  //끝날때 프린트 온도 설정
      
      { key: 'material_flow_layer_0', value: initial_layer_flow  }, //가변필요 //[nitial layer flow]초기 레이어 압출량 (레이어가 1개이므로 layer_0)현재 200% 전체 레이어에대한 압출량 수정은 다른 옵션존재함 
      { key: 'speed_travel', value: travel_speed  },  //[travel speed] 헤드가 압출하지 않을때 속력 현재 350 mm/s //가변필요
      { key: 'retraction_amount', value: retraction_distance }, //[retraction Distance] //가변필요

      { key: 'retraction_retract_speed', value: retraction_speed  },//가변필요 //[retraction speed] 자식 요소 이걸통해 retraction speed 조정 단위: mm/s
      { key: 'retraction_prime_speed', value: retraction_speed  },//가변필요 //[retraction speed] 자식 요소 이걸통해 retraction speed 조정 단위: mm/s 

      { key: 'top_layers', value:0  },  //profile상 요청
      { key: 'bottom_layers', value: 0 },//profile상 요청
      { key: 'initial_bottom_layers', value:0  },//profile상 요청

      { key: 'infill_sparse_density', value:0  }, //내부채움 밀도 [infill density]
      { key: 'infill_line_distance', value:0  }, //내부채움 선 길이  [infill density] 자식요소
      
      { key: 'retraction_min_travel', value:retaraction_minimum_travel  }, //[retaraction travel] 최소 움직임 단위: mm // 프로파일에서는 이게 디폴트이나 현재 우리설정 디폴트는 1.5여서 수정
      
      { key: 'speed_travel_layer_0', value: initial_layer_travel_speed  },//가변필요 // [Initial Layer Travel Speed ]수정을 위한 값

      { key: 'layer_height_0', value: initial_layer_height  }, //결과 layer 가 1개이므로 profile 상 디폴트이나 우리시스템은 디폴트가 아니므로 수정함

      { key: 'skirt_brim_line_width', value: 0 }, // 스커트 라인 두께
      { key: 'skirt_line_count', value: 0 },// 스커트 라인 두께
      { key: 'brim_line_count', value: 0 },

      { key: 'skin_line_width', value: 0 },// 바닥, 천장 라인 두께
      { key: 'mesh_position_z', value: 5 }, //가변필요 // z방향 오프셋 (높이)

      { key: 'retraction_hop_enabled', value: retraction_hop_enabled }, //z-hop 설정 enable 하는 옵션
      { key: 'retraction_hop', value: retraction_hop }, // z-hop 높이 설정 0~10mm 까지
      
      { key: 'speed_print_layer_0', value: print_speed }, // print speed -> 레이어가 한개이므로 inital_layerspeed 조정

      // { key: 'machine_extruder_start_code', value:"G21 G90 G28 G1 F5000 Z3.0 G92 E0 Z0 G1 E20 G92 E0"  }, //2번째로 적용되는 문제있음 지금상태로는 동작은하나 추후  설정파일 [machine_start_code] 에 직접 삽입필요
      // { key: 'machine_extruder_end_code', value:"G90 G1 F8000 Z+5 E-50 G1 X0 Y0 G28 G980 M84"  }, //실제로는 적용안됨 설정파일 [machine_end_code] 직접수정 필요
      // { key: 'center_object',value:true} //결과물 베드위 중앙정렬 옵션이나 먹긴하는데 제대로 중앙정렬 안됨 가끔 글자 짤림      
    ], 
    transfer: false,
    verbose: false
  });

  const openFont = await opentype.load(`./font/${font}`);
  const geometry = stringToGeometry(openFont, message, size, hole);
  const stl = geometryToSTL(geometry);
  slicer.on('progress', percent =>
  {
    console.log(`Progress: ${percent}%`);
  });
  const {gcode, metadata} = await slicer.slice(stl, 'stl');
  slicer.destroy();
  let tmp  = Buffer.from(gcode).toString();

  const regex = /;Home\nG1 Z(\d+\.\d+)/;
  const matches = regex.exec(tmp);

  if (matches) {
    const z = parseFloat(matches[1]);
    const newZ = z + zoffset;
    tmp = tmp.replace(regex, `;Home\nG1 Z${newZ.toFixed(1)}`);
  }


  let split2 = tmp.split(';MESH:Model.stl\n');
  let layer1 = split2[1].split('\n');

  let currentText = layer1[0];
  let currentSplit = currentText.split('Z');
  let zvalue = "Z" + (parseFloat(currentSplit[1]) + zoffset).toFixed(3) + "\n"
  currentText = currentSplit[0] + zvalue

  let result = (split2[0] + ";MESH:Model.stl\n" + currentText + layer1.slice(1).join("\n") + split2.slice(2).join(';MESH:Model.stl\n'))
  
  /*
  * 초기 default startcode 삭제
  */
  let splitResult = result.split(';Generated with Cura_SteamEngine master');
  result = ( splitResult[0] + ";Generated with Cura_SteamEngine master\n" + ";Prime the extruder\n"+splitResult[1].split(';Prime the extruder')[1]);

  /*
  * startcode 추가
  */
  splitResult = result.split(';Prime the extruder');
  result = ( splitResult[0]  + start_code + '\n;LAYER_COUNT' + splitResult[1].split(';LAYER_COUNT')[1] );

  /*
  * ;TYPE:WALL-OUTER 다음 1,2 번쨰줄 사이 G1 E+1.22 G92 E0 추가
  */
  splitResult = result.split(';TYPE:WALL-OUTER');
  result = ( splitResult[0] +';TYPE:WALL-OUTER\n'+splitResult[1].split('\n')[1]+'\n'+next2_outer_wall_code+splitResult[1].split('\n').slice(2).join('\n') );

  /*
  * 초기 default endcode 삭제
  */
  splitResult = result.split(';TIME_ELAPSED:');
  result = (splitResult[0] + ";TIME_ELAPSED:" + splitResult[1].split('\n')[0].split(';Retract the filament')[0] + "\n;Retract the filament\n")

  /*
  * endcode 추가
  */
  splitResult = result.split(';Retract the filament');
  result =( splitResult[0]  + end_code + '\n' );
 
  return result;
  
}
exports.goyooGcodeGenerateV2 = async (body) => {
  const {
    design = null,
    zoffset = 0,
    initial_layer_flow = 200,
    layer_height = 0.6,

    retraction_speed = 120,
    retraction_distance = 30,
    retaraction_minimum_travel = 1.0,
    travel_speed = 350,
    initial_layer_travel_speed = 350,
    initial_layer_height = 0.45,

    start_code = 'G21\nG90\nG28\nG1 F5000 Z3.0\nG92 E0 Z0\nG1 E20\nG92 E0',
    next2_outer_wall_code = 'G1 E+1.22\nG92 E0\n',
    end_code ='G90\nG1 F8000 Z+5 E-50\nG1 X0 Y0\nG28\nG980\nM84',

    retraction_hop_enabled = false,
    retraction_hop = 1,

    print_speed = 30.0,
  } = body;

  const definition = resolveDefinition('custom');
  const slicer = new CuraWASM({
    definition,
    overrides: [
      { key: 'layer_height', value: layer_height }, //가변필요 //stl의 높이에따라 가변되어야함 즉 글자stl의 사이즈가 변경되면 정비례하게 변경되어야함 자세한건 후술 cli 에서는 옵션이 안먹어서 설정파일을 수정했으나 wasam에서는 동작함 이거에 따라 레이어 갯수가 결정됨 레이어갯수 = 실제 모델 높이 / layer_height

      { key: 'wall_line_count', value:1  },

      { key: 'material_print_temperature', value:0  }, //초기 프린트 온도 설정
      { key: 'material_print_temperature_layer_0', value:0  }, //초기 레이어 프린트 온도 설정
      { key: 'material_initial_print_temperature', value:0  }, //시작 프린트 온도 설정 
      { key: 'material_final_print_temperature', value:0  },  //끝날때 프린트 온도 설정
      
      { key: 'material_flow_layer_0', value: initial_layer_flow  }, //가변필요 //[nitial layer flow]초기 레이어 압출량 (레이어가 1개이므로 layer_0)현재 200% 전체 레이어에대한 압출량 수정은 다른 옵션존재함 
      { key: 'speed_travel', value: travel_speed  },  //[travel speed] 헤드가 압출하지 않을때 속력 현재 350 mm/s //가변필요
      { key: 'retraction_amount', value: retraction_distance }, //[retraction Distance] //가변필요

      { key: 'retraction_retract_speed', value: retraction_speed  },//가변필요 //[retraction speed] 자식 요소 이걸통해 retraction speed 조정 단위: mm/s
      { key: 'retraction_prime_speed', value: retraction_speed  },//가변필요 //[retraction speed] 자식 요소 이걸통해 retraction speed 조정 단위: mm/s 

      { key: 'top_layers', value:0  },  //profile상 요청
      { key: 'bottom_layers', value: 0 },//profile상 요청
      { key: 'initial_bottom_layers', value:0  },//profile상 요청

      { key: 'infill_sparse_density', value:0  }, //내부채움 밀도 [infill density]
      { key: 'infill_line_distance', value:0  }, //내부채움 선 길이  [infill density] 자식요소
      
      { key: 'retraction_min_travel', value:retaraction_minimum_travel  }, //[retaraction travel] 최소 움직임 단위: mm // 프로파일에서는 이게 디폴트이나 현재 우리설정 디폴트는 1.5여서 수정
      
      { key: 'speed_travel_layer_0', value: initial_layer_travel_speed  },//가변필요 // [Initial Layer Travel Speed ]수정을 위한 값

      { key: 'layer_height_0', value: initial_layer_height  }, //결과 layer 가 1개이므로 profile 상 디폴트이나 우리시스템은 디폴트가 아니므로 수정함

      { key: 'skirt_brim_line_width', value: 0 }, // 스커트 라인 두께
      { key: 'skirt_line_count', value: 0 },// 스커트 라인 두께
      { key: 'brim_line_count', value: 0 },

      { key: 'skin_line_width', value: 0 },// 바닥, 천장 라인 두께
      { key: 'mesh_position_z', value: 5 }, //가변필요 // z방향 오프셋 (높이)

      { key: 'retraction_hop_enabled', value: retraction_hop_enabled }, //z-hop 설정 enable 하는 옵션
      { key: 'retraction_hop', value: retraction_hop }, // z-hop 높이 설정 0~10mm 까지
      
      { key: 'speed_print_layer_0', value: print_speed }, // print speed -> 레이어가 한개이므로 inital_layerspeed 조정

      // { key: 'machine_extruder_start_code', value:"G21 G90 G28 G1 F5000 Z3.0 G92 E0 Z0 G1 E20 G92 E0"  }, //2번째로 적용되는 문제있음 지금상태로는 동작은하나 추후  설정파일 [machine_start_code] 에 직접 삽입필요
      // { key: 'machine_extruder_end_code', value:"G90 G1 F8000 Z+5 E-50 G1 X0 Y0 G28 G980 M84"  }, //실제로는 적용안됨 설정파일 [machine_end_code] 직접수정 필요
      // { key: 'center_object',value:true} //결과물 베드위 중앙정렬 옵션이나 먹긴하는데 제대로 중앙정렬 안됨 가끔 글자 짤림      
    ], 
    transfer: false,
    verbose: false
  });
  var stlName ="iink-default.stl";
  console.log(design)
  switch(design){
    case "감사":
      stlName ="thank_you.stl";
      break;
    case "사랑":
      stlName ="love.stl";
      break;
    case "스마일":
      stlName ="smile.stl";
      break;
    case "크리스마스":
      stlName ="cristmas.stl";
      break;
    default:
      break;

  }

  slicer.on('progress', percent =>
  {
    console.log(`Progress: ${percent}%`);
  });
  const {gcode, metadata} = await slicer.slice(fs.readFileSync(stlName).buffer, 'stl')
  slicer.destroy();
  let tmp  = Buffer.from(gcode).toString();

  const regex = /;Home\nG1 Z(\d+\.\d+)/;
  const matches = regex.exec(tmp);

  if (matches) {
    const z = parseFloat(matches[1]);
    const newZ = z + zoffset;
    tmp = tmp.replace(regex, `;Home\nG1 Z${newZ.toFixed(1)}`);
  }


  let split2 = tmp.split(';MESH:Model.stl\n');
  let layer1 = split2[1].split('\n');

  let currentText = layer1[0];
  let currentSplit = currentText.split('Z');
  let zvalue = "Z" + (parseFloat(currentSplit[1]) + zoffset).toFixed(3) + "\n"
  currentText = currentSplit[0] + zvalue

  let result = (split2[0] + ";MESH:Model.stl\n" + currentText + layer1.slice(1).join("\n") + split2.slice(2).join(';MESH:Model.stl\n'))
  
  /*
  * 초기 default startcode 삭제
  */
  let splitResult = result.split(';Generated with Cura_SteamEngine master');
  result = ( splitResult[0] + ";Generated with Cura_SteamEngine master\n" + ";Prime the extruder\n"+splitResult[1].split(';Prime the extruder')[1]);

  /*
  * startcode 추가
  */
  splitResult = result.split(';Prime the extruder');
  result = ( splitResult[0]  + start_code + '\n;LAYER_COUNT' + splitResult[1].split(';LAYER_COUNT')[1] );

  /*
  * ;TYPE:WALL-OUTER 다음 1,2 번쨰줄 사이 G1 E+1.22 G92 E0 추가
  */
  splitResult = result.split(';TYPE:WALL-OUTER');
  result = ( splitResult[0] +';TYPE:WALL-OUTER\n'+splitResult[1].split('\n')[1]+'\n'+next2_outer_wall_code+splitResult[1].split('\n').slice(2).join('\n') );

  /*
  * 초기 default endcode 삭제
  */
  splitResult = result.split(';TIME_ELAPSED:');
  result = (splitResult[0] + ";TIME_ELAPSED:" + splitResult[1].split('\n')[0].split(';Retract the filament')[0] + "\n;Retract the filament\n")

  /*
  * endcode 추가
  */
  splitResult = result.split(';Retract the filament');
  result =( splitResult[0]  + end_code + '\n' );
 
  return result;
  
}
exports.iinkGcodeGenerateV1 = async (body) => {
  const {
    layer_height = 0.65,
    initial_layer_height = 0.4,
    line_width =  0.8,
    wall_line_count =  1,
    outer_wall_wipe_distance =  0.64,
    infill_pattern = "cubic",
    infill_density = 35,
    flow = 200,

    start_code = 'M104 S50\nM105\nM109 S50\nM82\nG21\nG90\nG28\nG1 Z10 F3000\nG1 X10 Y10 F18000\nG1 Z1.25 F1000\nG92 E0 Z0\nG1 E40 F4000\nG92 E0\nG92 E0\nG92 E0\n',
    end_code ='M107\nM83\nG0 E-15 F7000\nG91\nG1 Z2 F8000\nG1 X-235 F18000\nG90\nG28 X\nG1 Y200 F15000\nM82\nM84\nM82\nM104 S0\n', 
  } = body;
  var infill_line_distance = 2.4;
  switch(infill_pattern){
    case "cross_3d":
      infill_line_distance= 0.8;
      break;
    case "cubic":
      infill_line_distance= 2.4;
      break;
    case "tetrahedral": //octet
      infill_line_distance= 1.6;
      break;
    case "trihexagon":
      infill_line_distance= 2.4;
      break;

    default:
      infill_line_distance= 2.4;
      break;

  }

  const stlName = 'iink-default.stl'
  const definition = resolveDefinition('custom');
  const convert_infill_line_distance = infill_line_distance/(infill_density /100);
  const slicer = new CuraWASM({
    definition,
    overrides: [
      { key: 'layer_height', value: layer_height },
      { key: 'layer_height_0', value: initial_layer_height  },

      { key: 'wall_line_width_0', value: line_width  },
      { key: 'wall_line_width_x', value: line_width  },
      { key: 'infill_line_width', value: line_width  },

      { key: 'wall_line_count', value: wall_line_count  },

      { key: 'wall_0_wipe_dist', value: outer_wall_wipe_distance  },
      { key: 'wall_0_inset', value: 0.24  },

      { key: 'optimize_wall_printing_order', value: true  },
      { key: 'fill_outline_gaps', value: true  },

      { key: 'z_seam_type', value: "shortest"  },

      { key: 'infill_pattern', value: infill_pattern  },
      { key: 'infill_line_distance', value: convert_infill_line_distance  },

      { key: 'top_layers', value:0  }, 
      { key: 'bottom_layers', value: 0 },
      { key: 'initial_bottom_layers', value:0  },
      
      { key: 'material_print_temperature', value:50  }, 
      { key: 'material_print_temperature_layer_0', value:50  },
      { key: 'material_initial_print_temperature', value:50  }, 
      { key: 'material_final_print_temperature', value:50  }, 

      { key: 'wall_0_material_flow', value:flow  }, 
      { key: 'wall_x_material_flow', value:flow }, 
      { key: 'infill_material_flow', value:flow }, 
      { key: 'prime_tower_flow', value:flow }, 

      { key: 'speed_infill', value: 30 },
      { key: 'speed_wall_0', value: 30 },
      { key: 'speed_wall_x', value: 30 },
      { key: 'speed_travel', value: 200  },
      { key: 'speed_print_layer_0', value: 20 }, 
      { key: 'speed_travel_layer_0', value: 100  },

      { key: 'retraction_enable', value: false },
      { key: 'retraction_min_travel', value: 1.6 },
      { key: 'travel_avoid_supports', value: true },

      { key: 'adhesion_type', value: "none" },

      { key: 'carve_multiple_volumes', value: false },

      { key: 'meshfix_maximum_travel_resolution', value: 1.6 },

      { key: 'print_sequence', value: "one_at_a_time"},

      { key: 'cross_infill_pocket_size', value: 2.2857},
      { key: 'center_object', value: true }, 
    ], 
    transfer: false,
    verbose: false
  });

  slicer.on('progress', percent =>
  {
    console.log(`Progress: ${percent}%`);
  });
  const {gcode, metadata} = await slicer.slice(fs.readFileSync(stlName).buffer, 'stl')
  slicer.destroy();
  let result  = Buffer.from(gcode).toString();
  
  /*
  * 초기 default startcode 삭제
  */
  let splitResult = result.split(';Generated with Cura_SteamEngine master');
  result = ( splitResult[0] + ";Generated with Cura_SteamEngine master\n" + ";Prime the extruder\n"+splitResult[1].split(';Prime the extruder')[1]);

  /*
  * startcode 추가
  */
  splitResult = result.split(';Prime the extruder');
  result = ( splitResult[0]  + start_code + '\n;LAYER_COUNT' + splitResult[1].split(';LAYER_COUNT')[1] );

  /*
  * 초기 default endcode 삭제
  */
  const startTag = ";TIME_ELAPSED:";
  const endTag = ";Retract the filament";

  const startIndices = [];
  let startIndex = result.indexOf(startTag);
  while (startIndex !== -1) {
    startIndices.push(startIndex);
    startIndex = result.indexOf(startTag, startIndex + 1);
  }

  if (startIndices.length > 0) {
    const lastStartIndex = startIndices[startIndices.length - 1];
    const endIndex = result.indexOf(endTag, lastStartIndex);

    if (lastStartIndex !== -1 && endIndex !== -1) {
      const removedContent = result.slice(lastStartIndex, endIndex);
      result = result.replace(removedContent, "");
    } 
  } 
  /*
  * endcode 추가
  */
  splitResult = result.split(';Retract the filament');
  result =( splitResult[0]  + end_code + '\n' );
 
  return result;
  
}
exports.iinkGcodeGenerateV2 = async (body) => {
  const {
    layer_height = 0.65,
    initial_layer_height = 0.4,
    line_width =  0.8,
    wall_line_count =  1,
    outer_wall_wipe_distance =  0.64,
    infill_pattern = "cubic",
    infill_density = 35,
    flow =17,

    start_code = 'M104 S50\nM105\nM109 S50\nM82\nG21\nG90\nG92 E0\nG28\nG1 F2000 Z100\nG1 X20 Y52\nG28 Z\nG92 X55 Y-20 E0\nG92 E0\nG92 E0\n',
    end_code ='M107\nG90\nG1 F1000 Z+10 E-3\nG28 X Y\nG980\nM82\nM104 S0\n',
  } = body;
  var infill_line_distance = 2.4;
  switch(infill_pattern){
    case "cross_3d":
      infill_line_distance= 0.8;
      break;
    case "cubic":
      infill_line_distance= 2.4;
      break;
    case "tetrahedral": //octet
      infill_line_distance= 1.6;
      break;
    case "trihexagon":
      infill_line_distance= 2.4;
      break;

    default:
      infill_line_distance= 2.4;
      break;

  }

  const stlName = 'iink-default.stl'
  const definition = resolveDefinition('custom');
  const convert_infill_line_distance = infill_line_distance/(infill_density /100);
  const slicer = new CuraWASM({
    definition,
    overrides: [
      { key: 'layer_height', value: layer_height },
      { key: 'layer_height_0', value: initial_layer_height  },

      { key: 'wall_line_width_0', value: line_width  },
      { key: 'wall_line_width_x', value: line_width  },
      { key: 'infill_line_width', value: line_width  },

      { key: 'wall_line_count', value: wall_line_count  },

      { key: 'wall_0_wipe_dist', value: outer_wall_wipe_distance  },

      { key: 'top_layers', value:0  }, 
      { key: 'bottom_layers', value: 0 },
      { key: 'initial_bottom_layers', value:0  },
      
      { key: 'wall_0_inset', value: 0.24  },

      { key: 'optimize_wall_printing_order', value: true  },
      { key: 'fill_outline_gaps', value: true  },

      { key: 'z_seam_type', value: "shortest"  },

      { key: 'infill_pattern', value: infill_pattern  },
      { key: 'infill_line_distance', value: convert_infill_line_distance  },

      { key: 'material_print_temperature', value:50  }, 
      { key: 'material_print_temperature_layer_0', value:50  },
      { key: 'material_initial_print_temperature', value:50  }, 
      { key: 'material_final_print_temperature', value:50  }, 

      { key: 'wall_0_material_flow', value:flow  }, 
      { key: 'wall_x_material_flow', value:flow }, 
      { key: 'infill_material_flow', value:flow }, 
      { key: 'prime_tower_flow', value:flow }, 

      { key: 'speed_infill', value: 30 },
      { key: 'speed_wall_0', value: 30 },
      { key: 'speed_wall_x', value: 30 },
      { key: 'speed_travel', value: 200  },
      { key: 'speed_print_layer_0', value: 30 }, 
      { key: 'speed_travel_layer_0', value: 200  },

      { key: 'retraction_enable', value: false },
      { key: 'retraction_min_travel', value: 1.6 },
      { key: 'travel_avoid_supports', value: true },

      { key: 'adhesion_type', value: "none" },

      { key: 'carve_multiple_volumes', value: false },

      { key: 'meshfix_maximum_travel_resolution', value: 1.6 },

      { key: 'print_sequence', value: "one_at_a_time"},

      { key: 'center_object', value: true }, 
    ], 
    transfer: false,
    verbose: false
  });

  slicer.on('progress', percent =>
  {
    console.log(`Progress: ${percent}%`);
  });
  const {gcode, metadata} = await slicer.slice(fs.readFileSync(stlName).buffer, 'stl')
  slicer.destroy();
  let result  = Buffer.from(gcode).toString();

  /*
  * 초기 default startcode 삭제
  */
  let splitResult = result.split(';Generated with Cura_SteamEngine master');
  result = ( splitResult[0] + ";Generated with Cura_SteamEngine master\n" + ";Prime the extruder\n"+splitResult[1].split(';Prime the extruder')[1]);

  /*
  * startcode 추가
  */
  splitResult = result.split(';Prime the extruder');
  result = ( splitResult[0]  + start_code + '\n;LAYER_COUNT' + splitResult[1].split(';LAYER_COUNT')[1] );
  /*
    초기 endcode 삭제
  */
  const startTag = ";TIME_ELAPSED:";
  const endTag = ";Retract the filament";

  const startIndices = [];
  let startIndex = result.indexOf(startTag);
  while (startIndex !== -1) {
    startIndices.push(startIndex);
    startIndex = result.indexOf(startTag, startIndex + 1);
  }

  if (startIndices.length > 0) {
    const lastStartIndex = startIndices[startIndices.length - 1];
    const endIndex = result.indexOf(endTag, lastStartIndex);

    if (lastStartIndex !== -1 && endIndex !== -1) {
      const removedContent = result.slice(lastStartIndex, endIndex);
      result = result.replace(removedContent, "");
    } 
  } 
  /*
  * endcode 추가
  */
  splitResult = result.split(';Retract the filament');
  result =( splitResult[0]  + end_code + '\n' );
 
  return result;
}
exports.apiGcodeGenerate = async (request) => {
  const {
    stl_file = 'iink-default.stl',
    start_code = 'G1 F2000 Z100\nG1 X20 Y52\nG28\nG92 X55 Y-20 E0\nG92 E0\nG92 E0\n',
    end_code ='M107\nG90\nG1 F1000 Z+10 E-3\nG28 X Y\nG980\nM82\nM104 S0\n',
    prime = 'G1 E+1.22\nG92 E0',

    print_size_x = 160,
    print_size_y = 250,
    /*
      temperature
    */
    printing_temperature =210,
    printing_temperature_initial_layer =printing_temperature,
    initial_printing_temperature =printing_temperature-10,
    final_printing_temperature=printing_temperature-15,
    build_plate_temperature = 60,
    /*
      flow
    */
    flow =100,
    wall_flow =flow,
    outer_wall_flow=flow,
    inner_wall_flow=flow,
    top_bottom_flow=flow,
    infill_flow=flow,
    skirt_brim_flow =flow,
    prime_tower_flow = flow,
    initial_layer_flow =flow,
    /*
      speed
    */
    print_speed = 60,
    infill_speed = print_speed,
    wall_speed = print_speed/2,
    outer_wall_speed = wall_speed,
    inner_speed = wall_speed*2,
    top_bottom_speed = wall_speed,
    travel_speed = 120,
    
    initial_layer_speed = (print_speed*30)/60,
    initial_layer_print_speed = initial_layer_speed,
    initial_layer_travel_speed = 60,
    
    skirt_brim_speed = initial_layer_speed,

    retraction_speed = 25,
    retraction_retract_speed = retraction_speed,
    retraction_prime_speed = retraction_speed,
    /*
      height
    */
    layer_height = 2,
    initial_layer_height = 0.3,
    z_hop_when_retracted = false,
    z_hop_height = 1,
    /*
      distance
    */
   

    retraction_min_travel =6.5,  // 본래값은 retraction_distance =6.5이나 탑테이블 다른 협력체 요청사항으로 변경
    retaraction_minimum_travel =1.5, // 본래값은   retraction_min_travel =1.5 이나 탑테이블 다른 협력체 요청사항으로 변경
    /*
      infill
    */
    infill_pattern = "cubic",
    infill_density = 20,
    /*
      print_sequence
    */
    print_sequence=1,
    /*
      horizontal expansion
    */
    horizontal_expansion =0,
    /*
      wall line count
    */
    wall_line_count =  1,
    /*
        top/bottom layer
    */
    top_layers = 8,
    bottom_layers =999999,
    initial_bottom_layers =bottom_layers,
    /*
      Z Seam
    */
    z_seam_alignment = 4,
    z_seam_position = 1,
    /*
      adhesion
    */
   adhesion_type = 4,
  } = request.body;

  /*
    flow
  */
  var engine_outer_wall_flow=wall_flow;
  var engine_inner_wall_flow=wall_flow;
  
  if(wall_flow !== outer_wall_flow)
    engine_outer_wall_flow=outer_wall_flow;

  if(wall_flow !== inner_wall_flow)
    engine_inner_wall_flow=inner_wall_flow;
  /*
    infill
  */
  var infill_line_distance = 2.4;
  switch(infill_pattern){
    case "cross_3d":
      infill_line_distance= 0.8;
      break;
    case "cubic":
      infill_line_distance= 2.4;
      break;
    case "tetrahedral": //octet
      infill_line_distance= 1.6;
      break;
    case "trihexagon":
      infill_line_distance= 2.4;
      break;

    default:
      infill_line_distance= 2.4;
      break;

  }
  const convert_infill_line_distance = infill_line_distance/(infill_density /100);
  /*
    print sequence
  */
  var engine_print_sequence = "all_at_once"
  switch(print_sequence){
      case '2':
        engine_print_sequence = "one_at_a_time"
        break;
      default:
        engine_print_sequence = "all_at_once"
        break;
  }
  /*
    z_seam_alignment
  */
  var engine_z_seam_alignment = "sharpest_corner"
  switch(z_seam_alignment){
      case '0':
        engine_z_seam_alignment = "back"
        break;
      case '1':
        engine_z_seam_alignment = "shortest"
        break;
      case '2':
        engine_z_seam_alignment = "random"
        break;
      case '3':
        engine_z_seam_alignment = "sharpest_corner"
        break;
      
      default:
        engine_z_seam_alignment = "sharpest_corner"
        break;
  }
  var engine_z_seam_x = 0
  var engine_z_seam_y = 0
  switch(z_seam_position){
      case '0': //back left
        engine_z_seam_x = -1*print_size_x/2
        engine_z_seam_y = print_size_y/2
        break;
      case '1': //back
        engine_z_seam_x = 0
        engine_z_seam_y = print_size_y/2
        break;
      case '2': //back right
        engine_z_seam_x = print_size_x/2
        engine_z_seam_y = print_size_y/2
        break;
      case '3': //right
        engine_z_seam_x = print_size_x/2
        engine_z_seam_y = 0
        break;
      case '4': //frontright
        engine_z_seam_x = print_size_x/2
        engine_z_seam_y = -1*print_size_y/2
        break;
      case '5': //front
        engine_z_seam_x = 0
        engine_z_seam_y = -1*print_size_y/2
        break;
      case '6': //front left
        engine_z_seam_x = -1*print_size_x/2
        engine_z_seam_y = -1*print_size_y/2
        break;
      case '7': //left
        engine_z_seam_x = -1*print_size_x/2
        engine_z_seam_y = 0
        break;
      
      default: //back
        engine_z_seam_x = 0
        engine_z_seam_y = print_size_y/2
        break;
  }
  /*
    adhesion_type
  */
  var engine_adhesion_type = "none"
  switch(adhesion_type){
      case '0':
        engine_adhesion_type = "skirt"
        break;
      case '1':
        engine_adhesion_type = "brim"
        break;
      case '2':
        engine_adhesion_type = "raft"
        break;
      case '3':
        engine_adhesion_type = "none"
        break;
      
      default:
        engine_adhesion_type = "none"
        break;
  }

  const definition = resolveDefinition('custom');
  const slicer = new CuraWASM({
    definition,
    overrides: [
      { key: 'material_print_temperature', value: printing_temperature  }, 
      { key: 'material_print_temperature_layer_0', value: printing_temperature_initial_layer  },
      { key: 'material_initial_print_temperature', value: initial_printing_temperature  }, 
      { key: 'material_final_print_temperature', value: final_printing_temperature  }, 
      { key: 'machine_heated_bed', value: true  }, 
      { key: 'default_material_bed_temperature', value: build_plate_temperature  }, 
      { key: 'material_bed_temperature', value: build_plate_temperature  }, 
      { key: 'material_bed_temperature_layer_0', value: build_plate_temperature  }, 

      { key: 'wall_0_material_flow', value: engine_outer_wall_flow  }, 
      { key: 'wall_x_material_flow', value: engine_inner_wall_flow }, 
      { key: 'skin_material_flow', value: top_bottom_flow }, 
      { key: 'infill_material_flow', value: infill_flow }, 
      { key: 'skirt_brim_material_flow', value: skirt_brim_flow }, 
      { key: 'prime_tower_flow', value: prime_tower_flow }, 
      { key: 'material_flow_layer_0', value: initial_layer_flow },
      
      { key: 'speed_infill', value: infill_speed },
      { key: 'speed_wall_0', value: outer_wall_speed },
      { key: 'speed_wall_x', value: inner_speed },
      { key: 'speed_topbottom', value: top_bottom_speed },
      { key: 'speed_travel', value: travel_speed  },
      { key: 'speed_print_layer_0', value: initial_layer_print_speed }, 
      { key: 'speed_travel_layer_0', value: initial_layer_travel_speed  },
      { key: 'skirt_brim_speed', value: skirt_brim_speed  },
      { key: 'retraction_retract_speed', value: retraction_retract_speed  },
      { key: 'retraction_prime_speed', value: retraction_prime_speed  },

      { key: 'layer_height', value: layer_height  },
      { key: 'layer_height_0', value: initial_layer_height  },
      { key: 'retraction_hop_enabled', value: z_hop_when_retracted  },
      { key: 'retraction_hop', value: z_hop_height  },

      { key: 'retraction_amount', value: retraction_min_travel  },
      { key: 'retraction_min_travel', value: retaraction_minimum_travel  },

      { key: 'infill_pattern', value: infill_pattern  },
      { key: 'infill_line_distance', value: convert_infill_line_distance  },

      { key: 'print_sequence', value: engine_print_sequence},

      { key: 'xy_offset', value: horizontal_expansion},

      { key: 'wall_line_count', value: wall_line_count  },

      { key: 'top_layers', value: top_layers  }, 
      { key: 'bottom_layers', value: bottom_layers },
      { key: 'initial_bottom_layers', value: initial_bottom_layers  },

      { key: 'z_seam_type', value: engine_z_seam_alignment  },
      { key: 'z_seam_x', value: engine_z_seam_x  },
      { key: 'z_seam_y', value: engine_z_seam_y  },

      { key: 'adhesion_type', value: engine_adhesion_type }, //skirt brim raft 생성 none

    ], 
    transfer: false,
    verbose: false
  });

  slicer.on('progress', percent =>
  {
    console.log(`Progress: ${percent}%`);
  });

  if( request.files && request.files.stl_file)
  {
    const uploadFile= request.files.stl_file;
    const fileBuffer = fs.readFileSync(uploadFile.filepath);
    var {gcode, metadata} = await slicer.slice(fileBuffer.buffer, 'stl')
  }
  else
  { 
    var {gcode, metadata} = await slicer.slice(fs.readFileSync(stl_file).buffer, 'stl')
  }
 
  slicer.destroy();
  let result  = Buffer.from(gcode).toString();

  /*
  * 초기 default startcode 삭제
  */
  let splitResult = result.split(';Home');
  result = ( splitResult[0] + ";Home\n" + ";Prime the extruder\n"+splitResult[1].split(';Prime the extruder')[1]);

  /*
  * startcode 추가
  */
  splitResult = result.split(';Prime the extruder');
  result = ( splitResult[0]  + start_code + '\n;LAYER_COUNT' + splitResult[1].split(';LAYER_COUNT')[1] );
  
  /*
  * Prime 추가 (;TYPE:WALL-OUTER 다음 1,2 번쨰줄 사이 )
  */
  if (!prime.endsWith("\n")) 
    engine_prime = prime + "\n";
  else
    engine_prime = prime;
  
    result = result.replace(/(;MESH:Model.stl)\n(G0 .*?)(\n)/, '$1\n$2\n'+engine_prime);
  /*
    endcode 삭제
  */
  const startTag = ";TIME_ELAPSED:";
  const endTag = ";Retract the filament";

  const startIndices = [];
  let startIndex = result.indexOf(startTag);
  while (startIndex !== -1) {
    startIndices.push(startIndex);
    startIndex = result.indexOf(startTag, startIndex + 1);
  }

  if (startIndices.length > 0) {
    const lastStartIndex = startIndices[startIndices.length - 1];
    const endIndex = result.indexOf(endTag, lastStartIndex);

    if (lastStartIndex !== -1 && endIndex !== -1) {
      const removedContent = result.slice(lastStartIndex, endIndex);
      result = result.replace(removedContent, "");
    } 
  } 
  /*
  * endcode 추가
  */
  splitResult = result.split(';Retract the filament');
  result =( splitResult[0]  + end_code + '\n' );
 
  return result;
}

app.listen(port);