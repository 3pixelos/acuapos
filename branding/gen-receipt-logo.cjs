const fs=require('fs');const {PNG}=require('pngjs');
const png=PNG.sync.read(fs.readFileSync('/tmp/acua-receipt-200.png'));
const W=200,H=200;
if(png.width!==W||png.height!==H){console.error('size',png.width,png.height);process.exit(1);}
const bytesPerRow=W/8; // 25
const raster=Buffer.alloc(bytesPerRow*H,0);
let ink=0;
for(let y=0;y<H;y++){
  for(let x=0;x<W;x++){
    const idx=(y*W+x)*4;
    const r=png.data[idx],g=png.data[idx+1],b=png.data[idx+2];
    const lum=0.299*r+0.587*g+0.114*b;
    if(lum<128){ // dark = ink = bit 1
      raster[y*bytesPerRow + (x>>3)] |= (0x80>>(x&7));
      ink++;
    }
  }
}
const rasterB64=raster.toString('base64');
// transparent-bg PNG for HTML fallback
const pngT=PNG.sync.read(fs.readFileSync('/tmp/acua-receipt-t.png'));
const pngDataUri='data:image/png;base64,'+fs.readFileSync('/tmp/acua-receipt-t.png').toString('base64');
const out=`/**
 * Acua wordmark for receipt headers. Generated from branding/acua-receipt.svg
 * by branding/gen-receipt-logo (do not edit the encoded data by hand).
 * - RASTER: 200x200 1-bit bitmap (MSB-first rows of 25 bytes) for ESC/POS
 *   "GS v 0" raster printing on the thermal rolls.
 * - PNG: same mark as a data URI for the browser/HTML print fallback.
 */
export const RECEIPT_LOGO_WIDTH = 200
export const RECEIPT_LOGO_HEIGHT = 200

const RASTER_B64 = '${rasterB64}'

export function receiptLogoRaster(): Uint8Array {
  const bin = atob(RASTER_B64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const RECEIPT_LOGO_PNG =
  '${pngDataUri}'
`;
fs.writeFileSync('src/lib/receiptLogo.ts',out);
console.log('ink pixels:',ink,'raster bytes:',raster.length,'ts bytes:',out.length);
