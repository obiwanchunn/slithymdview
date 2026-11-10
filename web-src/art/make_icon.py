# SlithyMDView icon: the SlithyLens tove leaning over the top of a Markdown page,
# corkscrew tail down the side. Writes tove_md.svg (transparent) and icon_full.svg (iPhone background).
import math
def helix(x0,y0,x1,y1,turns,amp0,amp1,n=300):
    L=math.hypot(x1-x0,y1-y0); ux,uy=(x1-x0)/L,(y1-y0)/L; vx,vy=-uy,ux; pts=[]
    for i in range(n+1):
        t=i/n; a=amp0+(amp1-amp0)*t; ph=2*math.pi*turns*t
        pts.append((x0+ux*L*t+vx*a*math.sin(ph), y0+uy*L*t+vy*a*math.sin(ph), math.cos(ph), t))
    return pts
pts=helix(196,150,226,244,2.6,8,5)
def segs(front):
    out=[];cur=[]
    for x,y,c,t in pts:
        if (c>=0)==front: cur.append((x,y,t))
        else:
            if len(cur)>1: out.append(cur)
            cur=[]
    if len(cur)>1: out.append(cur)
    return out
pd=lambda s:"M"+" L".join(f"{x:.1f},{y:.1f}" for x,y,t in s)
w=lambda s,b:b*(1-0.5*s[len(s)//2][2])
back="".join(f'<path d="{pd(s)}" stroke="#1d3d17" stroke-width="{w(s,15)+5:.1f}" fill="none" stroke-linecap="round"/><path d="{pd(s)}" stroke="#3b7a2c" stroke-width="{w(s,15):.1f}" fill="none" stroke-linecap="round"/>' for s in segs(False))
front="".join(f'<path d="{pd(s)}" stroke="#1d3d17" stroke-width="{w(s,15)+5:.1f}" fill="none" stroke-linecap="round"/><path d="{pd(s)}" stroke="#6cc04a" stroke-width="{w(s,15):.1f}" fill="none" stroke-linecap="round"/>' for s in segs(True))
ex,ey,_,_=pts[-1]
HEAD="M52,92 C52,60 76,48 102,48 C128,48 152,60 152,92 C152,114 126,142 102,150 C78,142 52,114 52,92 Z"
inner=f'''<defs>
 <clipPath id="mdhead"><path d="{HEAD}"/></clipPath>
 <linearGradient id="mdskin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fd25a"/><stop offset="1" stop-color="#3f8a2e"/></linearGradient>
</defs>
<!-- tail, behind the page -->
{back}
<!-- the page -->
<rect x="46" y="92" width="152" height="150" rx="14" fill="#fbfaf6" stroke="#2c2c34" stroke-width="6"/>
<!-- Markdown mark: M and down arrow -->
<path d="M76,212 V158 L100,186 L124,158 V212" fill="none" stroke="#2e6fb5" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M162,158 V204" fill="none" stroke="#2e6fb5" stroke-width="15" stroke-linecap="round"/>
<path d="M142,190 L162,214 L182,190 Z" fill="#2e6fb5" stroke="#2e6fb5" stroke-width="6" stroke-linejoin="round"/>
<!-- tail tip in front -->
{front}
<circle cx="{ex:.1f}" cy="{ey:.1f}" r="4" fill="#6cc04a" stroke="#1d3d17" stroke-width="2.5"/>
<!-- tove head, leaning over the top edge -->
<g transform="translate(122,62) scale(0.78) translate(-102,-99)">
  <circle cx="62" cy="60" r="14" fill="#26232b"/><circle cx="62" cy="60" r="6.5" fill="#e9c9b8"/>
  <circle cx="142" cy="60" r="14" fill="#26232b"/><circle cx="142" cy="60" r="6.5" fill="#e9c9b8"/>
  <path d="{HEAD}" fill="#f6f1e7"/>
  <g clip-path="url(#mdhead)">
    <ellipse cx="78" cy="96" rx="15" ry="52" transform="rotate(-24 78 96)" fill="#26232b"/>
    <ellipse cx="126" cy="96" rx="15" ry="52" transform="rotate(24 126 96)" fill="#26232b"/>
  </g>
  <path d="{HEAD}" fill="none" stroke="#26232b" stroke-width="5"/>
  <circle cx="82" cy="98" r="9.5" fill="#ffc531" stroke="#5a3b00" stroke-width="1.5"/><ellipse cx="82" cy="98" rx="2.6" ry="7.5" fill="#111"/><circle cx="79" cy="94" r="2.4" fill="#fff"/>
  <circle cx="122" cy="98" r="9.5" fill="#ffc531" stroke="#5a3b00" stroke-width="1.5"/><ellipse cx="122" cy="98" rx="2.6" ry="7.5" fill="#111"/><circle cx="119" cy="94" r="2.4" fill="#fff"/>
  <ellipse cx="102" cy="138" rx="10" ry="7" fill="#1a1a1f"/><ellipse cx="99" cy="135.5" rx="3" ry="1.8" fill="#888"/>
</g>
<!-- paws gripping the top edge -->
<g stroke="#1d3d17" stroke-width="2.5">
 <g transform="translate(70,96)"><path d="M-7,6 l-2,9 l5,-6 z M0,7 l0,10 l3,-9 z M7,6 l3,9 l-1,-10 z" fill="#f1ead6" stroke-width="1.5"/><ellipse rx="13" ry="10" fill="url(#mdskin)"/></g>
 <g transform="translate(174,96)"><path d="M-7,6 l-2,9 l5,-6 z M0,7 l0,10 l3,-9 z M7,6 l3,9 l-1,-10 z" fill="#f1ead6" stroke-width="1.5"/><ellipse rx="13" ry="10" fill="url(#mdskin)"/></g>
</g>'''
open('tove_md.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">\n{inner}\n</svg>\n')
open('icon_full.svg','w').write(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs><radialGradient id="bgsky" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#3b4f6e"/><stop offset="0.55" stop-color="#22304a"/><stop offset="1" stop-color="#121a28"/></radialGradient></defs>
<rect width="1024" height="1024" fill="url(#bgsky)"/>
<g transform="translate(112,96) scale(3.1)">{inner}</g>
</svg>''')
