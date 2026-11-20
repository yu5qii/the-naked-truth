'use client';

import React, { useEffect, useRef } from 'react';
import { useMinimalStore } from '@/lib/store';
import styles from './BackgroundCanvas.module.scss';

// Extend window for test inspection
declare global {
  interface Window {
    __canvasHealth?: {
      mounted: boolean;
      contextActive: boolean;
      contextLost: boolean;
      isWebGL: boolean;
      glVersion: string;
      canvasMode: string;
    };
    __nakedTruthStore?: typeof useMinimalStore;
  }
}

export const BackgroundCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isAnalyzing = useMinimalStore((state) => state.isAnalyzing);
  const activeTab = useMinimalStore((state) => state.activeTab);

  useEffect(() => {
    // Expose store reference for automated testing bridge
    if (typeof window !== 'undefined') {
      window.__nakedTruthStore = useMinimalStore;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas resolution
    const updateSize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    // Acquire WebGL context (WebGL 2 with WebGL 1 fallback)
    const gl =
      canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' }) ||
      canvas.getContext('webgl', { alpha: true, antialias: true });

    if (!gl) {
      console.warn('WebGL is not supported or disabled on this device.');
      if (typeof window !== 'undefined') {
        window.__canvasHealth = {
          mounted: true,
          contextActive: false,
          contextLost: true,
          isWebGL: false,
          glVersion: 'none',
          canvasMode: activeTab,
        };
      }
      return;
    }

    let isLost = false;

    // Handle GPU Context Lost / Restored
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      isLost = true;
      if (window.__canvasHealth) {
        window.__canvasHealth.contextLost = true;
        window.__canvasHealth.contextActive = false;
      }
      console.warn('WebGL Context Lost. Preventing crash.');
    };

    const handleContextRestored = () => {
      isLost = false;
      if (window.__canvasHealth) {
        window.__canvasHealth.contextLost = false;
        window.__canvasHealth.contextActive = true;
      }
      console.info('WebGL Context Restored.');
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    // Simple vertex & fragment shaders for ambient background WebGL particles
    const vsSource = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_speed;
      void main() {
        vec2 pos = a_position;
        pos.y += sin(u_time * 0.5 + pos.x * 2.0) * 0.05 * u_speed;
        gl_Position = vec4(pos, 0.0, 1.0);
        gl_PointSize = 2.0;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform vec3 u_color;
      void main() {
        gl_FragColor = vec4(u_color, 0.35);
      }
    `;

    const compileShader = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();

    if (vs && fs && program) {
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
    }

    // Generate subtle grid coordinates
    const particles: number[] = [];
    const count = 48;
    for (let i = 0; i < count; i++) {
      particles.push((Math.random() * 2 - 1), (Math.random() * 2 - 1));
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particles), gl.STATIC_DRAW);

    // Initial health publication
    if (typeof window !== 'undefined') {
      window.__canvasHealth = {
        mounted: true,
        contextActive: true,
        contextLost: false,
        isWebGL: true,
        glVersion: gl instanceof WebGL2RenderingContext ? 'WebGL 2.0' : 'WebGL 1.0',
        canvasMode: activeTab,
      };
    }

    let animationFrameId: number;
    let startTime = performance.now();

    const render = () => {
      if (isLost || !gl || !program) return;

      const elapsed = (performance.now() - startTime) / 1000;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);

      const posLoc = gl.getAttribLocation(program, 'a_position');
      const timeLoc = gl.getUniformLocation(program, 'u_time');
      const speedLoc = gl.getUniformLocation(program, 'u_speed');
      const colorLoc = gl.getUniformLocation(program, 'u_color');

      gl.enableVertexAttribArray(posLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(timeLoc, elapsed);
      gl.uniform1f(speedLoc, isAnalyzing ? 3.0 : 1.0);

      // Color shifts based on active perspective
      let r = 0.5, g = 0.5, b = 0.55;
      if (activeTab === 'left') {
        r = 0.49; g = 0.83; b = 0.99; // subtle ice blue
      } else if (activeTab === 'right') {
        r = 0.99; g = 0.65; b = 0.65; // subtle terracotta
      } else if (activeTab === 'overview') {
        r = 0.65; g = 0.95; b = 0.82; // subtle sage
      }
      gl.uniform3f(colorLoc, r, g, b);

      gl.drawArrays(gl.POINTS, 0, count);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateSize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [isAnalyzing, activeTab]);

  return (
    <div className={styles.canvasContainer} aria-hidden="true">
      <canvas
        ref={canvasRef}
        id="r3f-canvas"
        data-testid="r3f-canvas"
        className={styles.canvas}
        data-canvas-state={isAnalyzing ? 'analyzing' : 'idle'}
        data-active-tab={activeTab}
      />
    </div>
  );
};
