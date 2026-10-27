"""Rebuild the original brass/S-rocket vector brand. Requires cairosvg (and the Cairo system library).
The app serves the generated SVG/PNG files directly; Python is not a runtime dependency.
"""
from pathlib import Path
import random
import cairosvg

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'web/public/brand'
defs = '''<defs>
<linearGradient id="brass" x2=".2" y2="1"><stop stop-color="#ffe4a3"/><stop offset=".18" stop-color="#c59750"/><stop offset=".48" stop-color="#ead098"/><stop offset=".65" stop-color="#ab763b"/><stop offset="1" stop-color="#67401e"/></linearGradient>
<linearGradient id="face" x2=".25" y2="1"><stop stop-color="#fff2d3"/><stop offset=".42" stop-color="#f1dbaf"/><stop offset=".76" stop-color="#dfbe88"/><stop offset="1" stop-color="#b98c51"/></linearGradient>
<linearGradient id="edge" x2="0" y2="1"><stop stop-color="#f6d797"/><stop offset=".5" stop-color="#a06b30"/><stop offset="1" stop-color="#3b2111"/></linearGradient>
<radialGradient id="enamel"><stop stop-color="#142a2b"/><stop offset="1" stop-color="#080e10"/></radialGradient>
<linearGradient id="ember" x2="0" y2="1"><stop stop-color="#e9b76d"/><stop offset="1" stop-color="#773e18" stop-opacity=".2"/></linearGradient>
</defs>'''
# Three fitted hull plates. Their opposing curved edges leave the hidden S in dark enamel.
rocket = '''<path d="M110 42 L133 96 Q137 110 135 123 L126 144 Q130 126 117 119 L101 109 Q94 104 95 94 Z" fill="url(#brass)" stroke="#c59a5d" stroke-width=".65"/>
<path d="M92 98 Q91 111 105 118 L115 124 Q126 132 120 146 L110 164 L107 145 L93 150 L81 137 L67 150 L81 115 Z" fill="url(#edge)" stroke="#b98c50" stroke-width=".65"/>
<path d="M137 116 L153 150 L142 146 L131 133 Z" fill="url(#brass)" stroke="#b98c50" stroke-width=".65"/>
<path d="M111 155 Q115 170 110 183 Q106 171 111 155" fill="url(#ember)"/>
<path d="M110 45 L123 80 M83 120 L75 139" stroke="#ffe3a3" stroke-width=".7" opacity=".55"/>'''
hexpath='M110 8 198 59 198 161 110 212 22 161 22 59Z'
inner='M110 29 180 70 180 150 110 191 40 150 40 70Z'
bolts=''.join(f'<g transform="translate({x} {y})"><circle r="3.2" fill="#3c2616"/><circle cy="-.8" r="2.2" fill="url(#brass)"/><path d="M-1.3 -.8h2.6" stroke="#644321" stroke-width=".7"/></g>' for x,y in [(110,19),(188,65),(188,155),(110,201),(32,155),(32,65)])
mark=f'''<path d="{hexpath}" transform="translate(0 5)" fill="#120c08" stroke="#28180d" stroke-width="5"/>
<path d="{hexpath}" fill="url(#brass)" stroke="#dda85e" stroke-width="1.5"/>
<path d="M110 15 192 63 192 157 110 205 28 157 28 63Z" fill="none" stroke="#f0d091" stroke-width="1"/>
<path d="{inner}" fill="url(#enamel)" stroke="#573b23" stroke-width="4"/>
<path d="M110 31 178 71" fill="none" stroke="#f0ce89" opacity=".55"/>{rocket}{bolts}'''
def svg(body,view='0 0 220 224',title='Shiptorio — S rocket seal'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img"><title>{title}</title>{defs}{body}</svg>\n'
(OUT/'mark.svg').write_text(svg(mark))
flat='''<path d="M110 12 195 61V159L110 208 25 159V61Z" fill="#0b1416" stroke="#d3ad70" stroke-width="12"/>
<path d="M110 42 135 99Q143 119 127 143Q134 124 114 116Q92 107 97 89Z M92 101Q88 115 107 123Q129 132 113 157L109 166L104 145L92 150L81 137L66 150L83 114Z M138 116L154 150L141 145L132 133Z" fill="#d3ad70"/>'''
(OUT/'mark-flat.svg').write_text(svg(flat))
(OUT/'favicon.svg').write_text(svg(flat))
# The wordmark is self-contained geometry, with no font load or external resources.
# Bespoke chamfered display letters, drawn for this brand (not ordinary UI font text).
letter_shapes = {
'S': ('M14 0H100V32H34V72H86L100 86V166L86 180H0V148H66V108H14L0 94V14Z',100),
'H': ('M0 0H34V70H72V0H106V180H72V108H34V180H0Z',106),
'I': ('M0 0H62V28H49V152H62V180H0V152H13V28H0Z',62),
'P': ('M0 0H84L102 18V90L84 108H34V180H0Z M34 30V78H67V30Z',102),
'T': ('M0 0H108V32H71V180H37V32H0Z',108),
# Both O's are the brand hexagon, cut as a letter (Justin, 2026-10-27: the O's should match).
'O': ('M60 0 120 30V150L60 180 0 150V30Z M60 32 32 46V134L60 148 88 134V46Z',120),
'R': ('M0 0H84L102 18V89L84 107H73L109 180H70L37 108H34V180H0Z M34 30V78H67V30Z',109),
}
paths=[]; x=26; last_o=0
for char in 'SHIPTORIO':
    path,w=letter_shapes[char]
    paths.append(f'<path d="{path}" fill-rule="evenodd" clip-rule="evenodd" transform="translate({x} 26)"/>')
    if char=='O': last_o=x
    x+=w+18
x-=18
letters=''.join(paths)
# Pipes behind the title, with collars; all geometry scales with the SVG.
pipes=''
for y in [88,152]:
    pipes+=f'<path d="M20 {y+10}v-10H{x+30}" fill="none" stroke="#28180f" stroke-width="10"/><path d="M20 {y+10}v-10H{x+30}" fill="none" stroke="#a15f32" stroke-width="5"/><path d="M21 {y+10}v-11H{x+30}" fill="none" stroke="#e4a66a" stroke-width="1"/>'
    for cx in range(50,int(x),73):
        pipes+=f'<rect x="{cx}" y="{y-5}" width="5" height="10" rx="1" fill="url(#edge)"/>'
# Fine deterministic metal speckling clipped inside letters; no raster textures or model assets.
rng=random.Random(3)
specks=''.join(f'<circle cx="{rng.uniform(26,x):.1f}" cy="{rng.uniform(26,210):.1f}" r="{rng.uniform(.3,.9):.1f}" fill="{rng.choice(["#5e412b","#fff7df"])}" opacity=".24"/>' for _ in range(1100))
rivets=''
for cx in range(37,int(x)-7,26):
    for cy in [40,195]:
        rivets+=f'<circle cx="{cx}" cy="{cy}" r="2.4" fill="#6b4628"/><circle cx="{cx-.4}" cy="{cy-.6}" r="1.4" fill="#ffe5ae"/>'
word=f'{pipes}<defs><clipPath id="letters">{letters}</clipPath></defs><g fill="#351c0c" stroke="#130c08" stroke-width="7" transform="translate(0 7)">{letters}</g><g fill="url(#face)" stroke="#785026" stroke-width="7" stroke-linejoin="bevel">{letters}</g><g fill="none" stroke="#ffebba" stroke-width="1.1">{letters}</g><g clip-path="url(#letters)">{specks}{rivets}</g><path d="M60 32 32 46V134L60 148 88 134V46Z" transform="translate({last_o} 26)" fill="url(#enamel)"/><g transform="translate({last_o+5} 60) scale(.5)" opacity=".75">{rocket}</g>'
# the last O carries a small rocket in its window, quiet enough that the word still reads first
width=round(x+26)
(OUT/'wordmark.svg').write_text(svg(word,f'0 0 {width} 240','Shiptorio'))
for size,name in [(16,'favicon-16.png'),(32,'favicon-32.png'),(180,'apple-touch-icon.png'),(192,'icon-192.png'),(512,'icon-512.png')]:
    cairosvg.svg2png(bytestring=svg(flat).encode(),write_to=str(OUT/name),output_width=size,output_height=size)
# Share image generated from the same source as the app brand.
share=f'<rect width="1200" height="630" fill="#0b1012"/><g transform="translate(75 170) scale({1050/width:.5f})">{word}</g><text x="600" y="440" text-anchor="middle" fill="#e5cba1" font-family="serif" font-size="34">A little play. A lot shipped.</text>'
cairosvg.svg2png(bytestring=svg(share,'0 0 1200 630').encode(),write_to=str(OUT/'og.png'))
(OUT/'pipe-rail.svg').write_text(svg('''<path d="M0 3H480M0 8H480" stroke="#261a13" stroke-width="3"/><path d="M0 2H480M0 7H480" stroke="#a07143" stroke-width="1.2"/><path d="M0 1.4H480" stroke="#e0b780" stroke-width=".5"/><g fill="url(#edge)">''' + ''.join(f'<rect x="{x}" y="0" width="4" height="9" rx="1"/>' for x in range(18,480,58)) + '</g>', '0 0 480 10', 'Copper pipe rail'))
print(f'wordmark {width}x240; brand vectors and icons rebuilt')
