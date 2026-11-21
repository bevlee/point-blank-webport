import type { ShaderMaterial } from "three";
import { applyBo3Finish, isBo3Finish, type Bo3Finish } from "./bo3Finish";

export type MasteryFinish = "flake" | "brushed" | "crystal" | "black-chrome" | Bo3Finish;

export function masteryFinish(value: unknown): MasteryFinish | null {
  if (isBo3Finish(value)) return value;
  return value === "flake" || value === "brushed" || value === "crystal" || value === "black-chrome" ? value : null;
}

/** UV-anchored flakes: highlights respond to the view, never to a random animation clock. */
export function applyMasteryFinish(material: ShaderMaterial, finish: MasteryFinish): void {
  if (isBo3Finish(finish)) { applyBo3Finish(material, finish); return; }
  const styleIds: Record<Exclude<MasteryFinish, Bo3Finish>, number> = { flake: 0, brushed: 1, crystal: 2, "black-chrome": 3 };
  material.uniforms.masteryStyle = { value: styleIds[finish] };
  material.fragmentShader = material.fragmentShader.replace("void main() {", `
    uniform float masteryStyle;
    vec2 masteryHash(vec2 p) {
      return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)))) * 43758.5453);
    }
    void main() {
  `).replace("D.rgb *= baseColor;", `
    float masteryDetail = dot(D.rgb, vec3(0.299, 0.587, 0.114));
    bool masteryGrip = vPbUv.x > 0.39 && vPbUv.x < 0.70 && vPbUv.y > 0.68;
    float masteryContour = pow(0.5 + 0.5 * sin(vPbUv.x * 190.0 + sin(vPbUv.y * 42.0) * 4.0), 20.0);
    float masteryRelief = clamp(0.40 + masteryDetail * 1.1 + masteryContour * 0.04, 0.15, 0.85);
    D.rgb = masteryGrip ? vec3(masteryDetail) : baseColor * masteryRelief;
  `).replace("// Phong_D_Dir_", `// Phong_D_Dir_
    if (!masteryGrip) {
      vec3 mn = normalize(N);
      vec3 mv = normalize(cameraPosition - vPbWorldPos);
      vec3 ml = normalize(pbLightDir + vec3(0.0001));
      vec3 mh = normalize(mv + ml);
      vec3 mt = normalize(cross(mn, abs(mn.y) < 0.95 ? vec3(0,1,0) : vec3(1,0,0)));
      vec3 mb = cross(mn, mt);
      vec3 mr = reflect(-mv, mn);
      float fresnel = pow(1.0 - max(dot(mn,mv),0.0), 4.0);
      vec3 reflected = vec3(0.14) + vec3(0.50,0.56,0.64) * smoothstep(-0.2,0.65,mr.y);
      if (pbHasEnv > 0.5) reflected = textureCube(pbEnvMap, mr).rgb;
      float band = pow(max(0.0, 1.0 - abs(mr.y - 0.32) * 3.0), 6.0);
      float lightLevel = clamp(dot(pbAmbient + pbLightDiffuse.rgb,vec3(0.333)),0.15,1.0);
      vec3 metal = masteryStyle > 2.5 ? vec3(0.75,0.80,0.88) : mix(baseColor,vec3(1.0),0.13);
      c = D.rgb * (pbAmbient + vec3(0.16) + max(dot(mn,ml),0.0) * 0.28);
      c += reflected * metal * (0.22 + fresnel * 0.42) * lightLevel;
      if (masteryStyle < 0.5 || masteryStyle > 2.5) {
        vec2 cell = floor(vPbUv * 250.0);
        vec2 random = masteryHash(cell);
        vec3 flakeNormal = normalize(mn + mt * (random.x-0.5)*0.85 + mb*(random.y-0.5)*0.85);
        float glint = pow(max(dot(flakeNormal,mh),0.0),110.0);
        float footprint = max(length(fwidth(vPbUv * 250.0)),1.0);
        glint /= footprint;
        if (masteryStyle > 2.5) glint *= step(0.72,random.y);
        c *= 0.92 + random.x * 0.13;
        c += metal * band * 0.38 + mix(metal,vec3(1),0.4) * glint * 2.8 * lightLevel;
        if (masteryStyle > 2.5) {
          float coat = pow(max(dot(mn,mh),0.0),180.0);
          c += vec3(0.88,0.93,1.0) * (coat*0.9 + fresnel*0.18) * lightLevel;
        }
      } else if (masteryStyle < 1.5) {
        float scratch = masteryHash(vec2(floor(vPbUv.y*1500.0),0)).x;
        float anisotropic = pow(max(1.0 - abs(dot(mh,mb)),0.0),18.0);
        float highlight = pow(max(dot(mn,mh),0.0),28.0);
        c *= 0.92 + scratch * 0.10;
        c += metal * (band*0.8 + anisotropic*highlight*0.85) * lightLevel;
      } else {
        vec2 cell = floor(vPbUv * 95.0);
        vec2 random = masteryHash(cell);
        vec3 facetNormal = normalize(mn + mt*(random.x-0.5)*1.5 + mb*(random.y-0.5)*1.5);
        float flash = pow(max(dot(facetNormal,mh),0.0),65.0);
        float facetBand = pow(max(1.0-abs(reflect(-mv,facetNormal).y-0.32)*3.0,0.0),10.0);
        float footprint = max(length(fwidth(vPbUv*95.0)),1.0);
        c *= 0.82 + random.x * 0.28;
        c += mix(metal,vec3(1),0.6) * (flash*3.2 + facetBand*0.8)/footprint * lightLevel;
      }
    }
  `);
}
