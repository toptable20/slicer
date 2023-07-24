const opentype = require('opentype.js');
const { stringToGeometry, geometryToSTL } = require('./TextMaker');
const fs = require('fs');
const { gcodeGenerate } = require('./index');



async function main() {
  switch (process.argv[2]) {
    
    case 'stl':
      await stl();
      break;

    case 'gcode':
      await gcode();
      break;
  
    default:
      break;  
  }
  process.exit();
}

async function gcode() {
  let tmp = await gcodeGenerate({});
  fs.writeFileSync("mygcode.gcode", Buffer.from(tmp));
}

async function stl() {
  const stlName = 'output.stl';
  const message = "예뷔퓨미혜햬";
  const size = 10;
  const hole = false;
  const font = "ChosunGu.ttf";


  const openFont = await opentype.load(`./font/${font}`);
  const geometry = stringToGeometry(openFont, message, size, hole);
  const stl = geometryToSTL(geometry);
  fs.writeFileSync(stlName, Buffer.from(stl));
}

main()