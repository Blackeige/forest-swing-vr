// Rendu WebGL1 léger : scène en un seul programme (éclairage par sommet + brouillard),
// rendu stéréo côte à côte dans un FBO, puis passe de distorsion « barillet » pour les lentilles Cardboard.
import { mat4, mat4Mul, mat4Perspective, mat4Translate } from './math.js';

const VS_SCENE = `attribute vec3 aPos;attribute vec3 aNrm;attribute vec3 aCol;
uniform mat4 uVP;uniform vec3 uCam;uniform vec3 uSun;uniform vec2 uFog;
varying vec3 vCol;varying float vFog;
void main(){float l=max(dot(aNrm,uSun),0.0);float hemi=0.5+0.5*aNrm.y;
vCol=aCol*(0.34+0.36*hemi+0.7*l);gl_Position=uVP*vec4(aPos,1.0);
vFog=clamp((length(aPos-uCam)-uFog.x)/(uFog.y-uFog.x),0.0,1.0);}`;
const FS_SCENE = `precision mediump float;uniform vec3 uFogCol;varying vec3 vCol;varying float vFog;
void main(){gl_FragColor=vec4(mix(vCol,uFogCol,vFog),1.0);}`;
const VS_PANEL = `attribute vec2 aPos;uniform mat4 uMVP;varying vec2 vUv;
void main(){vUv=aPos+0.5;gl_Position=uMVP*vec4(aPos,0.0,1.0);}`;
const FS_PANEL = `precision mediump float;uniform sampler2D uTex;uniform float uAlpha;varying vec2 vUv;
void main(){vec4 c=texture2D(uTex,vUv);gl_FragColor=vec4(c.rgb,c.a*uAlpha);}`;
const VS_POST = `attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}`;
const FS_POST = `precision mediump float;uniform sampler2D uTex;uniform vec2 uK;varying vec2 vUv;
void main(){float eye=step(0.5,vUv.x);vec2 e=vec2(vUv.x*2.0-eye,vUv.y);vec2 p=(e-0.5)*2.0;
float r2=dot(p,p)*0.5;vec2 s=p*(1.0+uK.x*r2+uK.y*r2*r2)*0.5+0.5;
if(s.x<0.0||s.x>1.0||s.y<0.0||s.y>1.0){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}
gl_FragColor=texture2D(uTex,vec2((s.x+eye)*0.5,s.y));}`;

function prog(gl, vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNrm'); gl.bindAttribLocation(p, 2, 'aCol'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    const opt = { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false };
    const gl = canvas.getContext('webgl', opt) || canvas.getContext('experimental-webgl', opt);
    if (!gl) throw new Error('WebGL indisponible');
    this.gl = gl; this.canvas = canvas;
    this.scene = prog(gl, VS_SCENE, FS_SCENE); this.panel = prog(gl, VS_PANEL, FS_PANEL); this.post = prog(gl, VS_POST, FS_POST);
    this.staticBuf = gl.createBuffer(); this.staticN = 0; this.dynBuf = gl.createBuffer(); this.dynCap = 0;
    this.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, .5, .5, -.5, -.5, .5, .5, -.5, .5]), gl.STATIC_DRAW);
    this.triBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.fbo = null; this.tex = null; this.depth = null; this.fw = 0; this.fh = 0;
    this.vp = mat4(); this.proj = mat4(); this.tmp = mat4(); this.mvp = mat4();
    this.sun = [0.4, 0.8, 0.45]; const l = Math.hypot(...this.sun); this.sun = this.sun.map((x) => x / l);
    this.fogCol = [0.55, 0.76, 0.95];
  }
  setSize(w, h, scale) {
    const gl = this.gl; this.cw = this.canvas.width = Math.max(2, Math.floor(w)); this.ch = this.canvas.height = Math.max(2, Math.floor(h));
    const fw = Math.max(2, Math.floor(this.cw * scale)), fh = Math.max(2, Math.floor(this.ch * scale));
    if (fw === this.fw && fh === this.fh && this.fbo) return;
    this.fw = fw; this.fh = fh;
    if (this.fbo) { gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.tex); gl.deleteRenderbuffer(this.depth); }
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fw, fh);
    this.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  uploadStatic(arr, n) { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf); gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, n * 9), gl.STATIC_DRAW); this.staticN = n; }
  uploadDynamic(arr, n) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    if (arr.length > this.dynCap) { gl.bufferData(gl.ARRAY_BUFFER, arr.byteLength, gl.DYNAMIC_DRAW); this.dynCap = arr.length; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr.subarray(0, n * 9)); this.dynN = n;
  }
  panelTexture(panel) {
    const gl = this.gl;
    if (!panel.tex) { panel.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, panel.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); panel.dirtyTex = true; }
    if (panel.dirtyTex) { gl.bindTexture(gl.TEXTURE_2D, panel.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, panel.c); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); panel.dirtyTex = false; }
  }
  _drawGeom(buf, n) {
    const gl = this.gl, s = this.scene; if (!n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  }
  _eye(view, cam, proj, panels, vx, vy, vw, vh, eyeOffX) {
    const gl = this.gl, s = this.scene;
    gl.viewport(vx, vy, vw, vh); gl.scissor(vx, vy, vw, vh);
    gl.clearColor(this.fogCol[0], this.fogCol[1], this.fogCol[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(s.p); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    mat4Mul(this.vp, proj, view);
    gl.uniformMatrix4fv(s.u.uVP, false, this.vp); gl.uniform3f(s.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform3f(s.u.uSun, this.sun[0], this.sun[1], this.sun[2]); gl.uniform2f(s.u.uFog, 35, 95); gl.uniform3f(s.u.uFogCol, this.fogCol[0], this.fogCol[1], this.fogCol[2]);
    this._drawGeom(this.staticBuf, this.staticN); this._drawGeom(this.dynBuf, this.dynN);
    // Panneaux 2D (HUD / menus)
    const p = this.panel; gl.useProgram(p.p); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    for (const pn of panels) {
      if (!pn.visible) continue; this.panelTexture(pn);
      if (pn.headLocked) { mat4Translate(this.tmp, -eyeOffX, 0, 0); mat4Mul(this.mvp, proj, this.tmp); mat4Mul(this.mvp, this.mvp, pn.model); } else mat4Mul(this.mvp, this.vp, pn.model);
      gl.uniformMatrix4fv(p.u.uMVP, false, this.mvp); gl.uniform1f(p.u.uAlpha, pn.opacity === undefined ? 1 : pn.opacity);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pn.tex); gl.uniform1i(p.u.uTex, 0); gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.disable(gl.BLEND);
  }
  // frame : {stereo, fov, views:[{view,cam,eyeX}], panels}
  render(frame) {
    const gl = this.gl; gl.enable(gl.SCISSOR_TEST);
    if (!frame.stereo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); mat4Perspective(this.proj, frame.fov, this.cw / this.ch, 0.05, 160);
      const v = frame.views[0]; this._eye(v.view, v.cam, this.proj, frame.panels, 0, 0, this.cw, this.ch, 0); gl.disable(gl.SCISSOR_TEST); return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); const hw = this.fw >> 1;
    mat4Perspective(this.proj, frame.fov, hw / this.fh, 0.05, 160);
    for (let i = 0; i < 2; i++) { const v = frame.views[i]; this._eye(v.view, v.cam, this.proj, frame.panels, i * hw, 0, hw, this.fh, v.eyeX); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, this.cw, this.ch);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const p = this.post; gl.useProgram(p.p); gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uK, frame.k1, frame.k2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
