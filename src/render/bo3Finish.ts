import type { ShaderMaterial } from "three";

export type Bo3Finish = "bo3-gold" | "bo3-diamond" | "bo3-dark-matter";

export function isBo3Finish(value: unknown): value is Bo3Finish {
  return value === "bo3-gold" || value === "bo3-diamond" || value === "bo3-dark-matter";
}

/** Original procedural studies guided by BO3 references, with large moving reflection shapes. */
export function applyBo3Finish(material: ShaderMaterial, finish: Bo3Finish): void {
  const ids: Record<Bo3Finish, number> = { "bo3-gold": 0, "bo3-diamond": 1, "bo3-dark-matter": 2 };
  material.uniforms.bo3Style = { value: ids[finish] };
  const time = { value: 0 };
  material.uniforms.bo3Time = time;
  material.onBeforeRender = () => { time.value = performance.now() * 0.001; };
  material.fragmentShader = material.fragmentShader.replace("void main() {", `
    uniform float bo3Style;
    uniform float bo3Time;
    float bHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float bNoise(vec2 p) {
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(bHash(i),bHash(i+vec2(1,0)),f.x),mix(bHash(i+vec2(0,1)),bHash(i+vec2(1,1)),f.x),f.y);
    }
    float bFbm(vec2 p) {
      float v=0.0, a=0.5;
      for(int i=0;i<4;i++){ v+=a*bNoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p; a*=0.5; }
      return v;
    }
    vec3 bReflection(vec3 r) {
      float stripe=exp(-pow((r.y+0.45*r.x-0.14)*4.5,2.0));
      vec3 sky=mix(vec3(0.025,0.035,0.05),vec3(0.42,0.53,0.70),smoothstep(-0.2,0.65,r.y));
      if(pbHasEnv>0.5) sky=mix(sky,textureCube(pbEnvMap,r).rgb,0.5);
      return sky + vec3(1.0,0.96,0.86)*(stripe*0.80+pow(stripe,8.0)*0.65);
    }
    void main() {
  `).replace("D.rgb *= baseColor;", `
    float bDetail=dot(D.rgb,vec3(0.299,0.587,0.114));
    bool bGrip=vPbUv.x>0.39 && vPbUv.x<0.70 && vPbUv.y>0.68;
    D.rgb*=baseColor;
  `).replace("// Phong_D_Dir_", `// Phong_D_Dir_
    if(!bGrip) {
      vec3 bn=normalize(N), bv=normalize(cameraPosition-vPbWorldPos);
      vec3 bt=normalize(cross(bn,abs(bn.y)<0.95?vec3(0,1,0):vec3(1,0,0)));
      vec3 bb=cross(bn,bt);
      vec3 br=reflect(-bv,bn);
      float bf=pow(1.0-max(dot(bn,bv),0.0),4.0);
      float relief=0.82+0.30*bDetail;
      vec3 gold=vec3(1.0,0.64,0.20);
      vec3 env=bReflection(br);
      float engraving=pow(0.5+0.5*sin(vPbUv.x*210.0+sin(vPbUv.y*35.0)*4.0),32.0);
      vec3 goldSurface=(vec3(0.16,0.070,0.009)+env*gold*0.90)*relief;
      goldSurface*=1.0-engraving*0.10;
      goldSurface+=vec3(1.0,0.90,0.62)*pow(max(dot(bn,normalize(bv+normalize(pbLightDir+vec3(.001)))),0.0),100.0)*0.55;
      if(bo3Style<0.5) {
        c=goldSurface;
      } else if(bo3Style<1.5) {
        vec2 uv=vPbUv*70.0;
        uv.x+=mod(floor(uv.y),2.0)*0.5;
        vec2 cell=floor(uv), q=fract(uv)-0.5;
        float radius=length(q);
        float jewel=1.0-smoothstep(0.38,0.46,radius);
        float facet=floor((atan(q.y,q.x)+3.141593)*1.27324)*0.785398;
        vec2 slope=vec2(cos(facet),sin(facet))*smoothstep(0.08,0.38,radius)*0.65;
        vec3 gn=normalize(bn+bt*slope.x+bb*slope.y);
        vec3 gr=reflect(-bv,gn);
        vec3 gemEnv=bReflection(gr);
        float fire=pow(max(dot(gn,normalize(bv+normalize(pbLightDir+vec3(.001)))),0.0),75.0);
        vec3 spectral=vec3(0.95)+vec3(0.12)*sin(vec3(0,2.1,4.2)+bHash(cell)*9.0+gr.x*4.0);
        vec3 gem=(vec3(0.30,0.34,0.41)+gemEnv*0.90+fire*1.7)*spectral;
        c=mix(goldSurface*0.85,gem,jewel)*relief;
      } else {
        vec2 p=vPbUv*7.0;
        float t=bo3Time*0.13;
        vec2 warp=vec2(bFbm(p+vec2(t,-t*.7)),bFbm(p+vec2(4.2-t*.6,1.7+t)));
        float cloud=bFbm(p*1.8+warp*3.5+vec2(t*.15,0));
        float bright=smoothstep(0.32,0.70,cloud);
        float hue=clamp((bFbm(p+warp*2.0+vec2(-t*.3,t*.25))-0.30)*3.0,0.0,1.0);
        vec3 nebula=mix(vec3(0.025,0.08,0.80),vec3(0.45,0.02,1.0),smoothstep(0.15,0.65,hue));
        nebula=mix(nebula,vec3(0.85,0.08,0.75),smoothstep(0.55,0.85,hue));
        float tendril=pow(1.0-abs(sin(cloud*14.0+warp.x*3.0)),7.0);
        c=mix(vec3(0.012,0.002,0.028),nebula*1.25,bright)*relief;
        c+=nebula*tendril*0.40+vec3(0.11,0.09,0.28)*env*(0.4+bf*0.9);
      }
      c+=vec3(0.8,0.88,1.0)*bf*0.12;
    }
  `);
}
