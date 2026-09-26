#!/usr/bin/env node
/**
 * Generates the neutral sample artwork used by the console's design preview
 * (public/preview/*.webp). Purely illustrative; tenants upload real photos.
 *   node scripts/generate-preview-art.mjs
 */
import sharp from "sharp";

const palettes = [
  ["#E9DCCB", "#5C3A21", "#C8A27A"],
  ["#DCE3DA", "#2F4F3E", "#A9BFA2"],
  ["#EFD9D2", "#7A3B2E", "#D9A28F"],
  ["#DDE2EA", "#1F3150", "#9DB0CC"],
  ["#F1E6D4", "#3A2A1C", "#D8B57E"],
  ["#E4DDEB", "#4B3561", "#B7A4CB"],
];

function bag([bg, main, accent], i) {
  const w = 1200,
    h = 1500;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="g" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="${bg}"/></radialGradient>
    <linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="${main}"/><stop offset=".55" stop-color="${main}" stop-opacity=".92"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <ellipse cx="600" cy="1270" rx="330" ry="46" fill="#000" opacity=".12"/>
  <path d="M390 360 L810 360 L850 1250 L350 1250 Z" fill="url(#b)"/>
  <path d="M390 360 L470 300 L730 300 L810 360 Z" fill="${main}" opacity=".85"/>
  <rect x="455" y="640" width="290" height="300" rx="${i % 2 ? 150 : 14}" fill="${accent}" opacity=".95"/>
  <rect x="505" y="720" width="190" height="12" rx="6" fill="${main}" opacity=".7"/>
  <rect x="535" y="760" width="130" height="10" rx="5" fill="${main}" opacity=".45"/>
  <circle cx="600" cy="860" r="34" fill="none" stroke="${main}" stroke-width="6" opacity=".55"/>
</svg>`;
}

const scene = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600">
  <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3A2A1C"/><stop offset="1" stop-color="#8A5A3B"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#s)"/>
  <circle cx="1650" cy="720" r="420" fill="#F1E6D4" opacity=".92"/>
  <circle cx="1650" cy="720" r="330" fill="#5C3A21"/>
  <circle cx="1650" cy="720" r="250" fill="#8A5A3B" opacity=".9"/>
  <path d="M1500 700 q150 -120 300 0 q-150 120 -300 0" fill="#C8A27A" opacity=".8"/>
  <ellipse cx="1650" cy="1180" rx="520" ry="60" fill="#000" opacity=".2"/>
  <circle cx="560" cy="360" r="220" fill="#C8A27A" opacity=".12"/>
</svg>`;

await Promise.all([
  ...palettes.map((p, i) =>
    sharp(Buffer.from(bag(p, i)))
      .resize(900)
      .webp({ quality: 78 })
      .toFile(`public/preview/product-${i + 1}.webp`),
  ),
  sharp(Buffer.from(scene)).resize(1800).webp({ quality: 78 }).toFile("public/preview/scene.webp"),
]);
console.log("Preview artwork written to public/preview/");
