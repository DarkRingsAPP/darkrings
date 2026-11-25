import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import Guilloche from "./Guilloche.jsx";

/**
 * The Ring: an iridescent black torus wearing an orbit of ciphertext.
 * Mounted after first paint so hero text wins LCP; falls back to the
 * engraved SVG rings on mobile, reduced motion, or any WebGL failure.
 */
export default function RingScene({ className = "" }) {
  const host = useRef(null);
  const reduce = useReducedMotion();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (reduce) return setFallback(true);
    if (typeof window === "undefined") return;

    let raf = null;
    let renderer = null;
    let disposed = false;
    let cleanupFns = [];

    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 180));
    const idleId = idle(async () => {
      if (disposed || !host.current) return;
      let THREE;
      try {
        THREE = await import("three");
      } catch {
        return setFallback(true);
      }
      if (disposed || !host.current) return;

      const el = host.current;
      const W = el.clientWidth;
      const H = el.clientHeight;

      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return setFallback(true);
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 50);
      camera.position.set(0, 0, 8.8);

      /* procedural envmap: an ember-to-teal gradient becomes the shimmer */
      const grad = document.createElement("canvas");
      grad.width = 256;
      grad.height = 256;
      const g = grad.getContext("2d");
      const lin = g.createLinearGradient(0, 0, 256, 256);
      lin.addColorStop(0, "#150c08");
      lin.addColorStop(0.3, "#ff6a3d");
      lin.addColorStop(0.5, "#0f0b0c");
      lin.addColorStop(0.68, "#8a3b1f");
      lin.addColorStop(0.84, "#27646f");
      lin.addColorStop(1, "#0a0809");
      g.fillStyle = lin;
      g.fillRect(0, 0, 256, 256);
      const envTex = new THREE.CanvasTexture(grad);
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = pmrem.fromEquirectangular(envTex).texture;

      /* the ring itself */
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(1.9, 0.62, 96, 200),
        new THREE.MeshPhysicalMaterial({
          color: 0x0d0b0c,
          metalness: 0.85,
          roughness: 0.36,
          clearcoat: 1,
          clearcoatRoughness: 0.22,
          iridescence: 0.55,
          iridescenceIOR: 1.6,
          envMap,
          envMapIntensity: 1.05,
        })
      );
      torus.rotation.x = 0.9;
      torus.rotation.z = -0.35;
      scene.add(torus);

      /* ciphertext orbit: canvas texture on a cylinder, FrontSide culls the back */
      const txt = document.createElement("canvas");
      txt.width = 2048;
      txt.height = 128;
      const t = txt.getContext("2d");
      t.clearRect(0, 0, 2048, 128);
      t.font = "500 62px 'Geist Mono Variable', monospace";
      t.fillStyle = "rgba(245,242,236,0.95)";
      const cipher = "8f21c4 ▮▮▮.▮▮ SOL 3fedez ▮,▮▮▮ USDC d7a901 ";
      t.fillText(cipher.repeat(3), 0, 84);
      const ringTex = new THREE.CanvasTexture(txt);
      ringTex.wrapS = THREE.RepeatWrapping;
      ringTex.colorSpace = THREE.SRGBColorSpace;

      const orbit = new THREE.Mesh(
        new THREE.CylinderGeometry(3.15, 3.15, 0.3, 96, 1, true),
        new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          alphaTest: 0.1,
          side: THREE.FrontSide,
        })
      );
      orbit.rotation.x = 1.12;
      orbit.rotation.z = -0.18;
      orbit.renderOrder = 1;
      scene.add(orbit);

      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const key = new THREE.DirectionalLight(0xffdcc8, 1.4);
      key.position.set(4, 5, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xff6a3d, 0.9);
      rim.position.set(-6, -2, -4);
      scene.add(rim);

      /* mouse parallax, damped outside React state */
      let targetX = 0;
      let targetY = 0;
      const onMove = (e) => {
        targetX = (e.clientX / window.innerWidth - 0.5) * 0.4;
        targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      cleanupFns.push(() => window.removeEventListener("pointermove", onMove));

      const onResize = () => {
        if (!host.current) return;
        const w = host.current.clientWidth;
        const h = host.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);
      cleanupFns.push(() => window.removeEventListener("resize", onResize));

      /* render only while visible: scrolling past the hero must cost nothing */
      let visible = true;
      const io = new IntersectionObserver(
        ([entry]) => {
          const was = visible;
          visible = entry.isIntersecting;
          if (!was && visible) {
            clock.getDelta();
            raf = requestAnimationFrame(loop);
          }
        },
        { threshold: 0.01 }
      );
      io.observe(el);
      cleanupFns.push(() => io.disconnect());

      const clock = new THREE.Clock();
      const loop = () => {
        if (!visible) return;
        const dt = clock.getDelta();
        torus.rotation.y += dt * 0.16;
        torus.rotation.x += (0.9 + targetY - torus.rotation.x) * 0.04;
        torus.rotation.z += (-0.35 - targetX - torus.rotation.z) * 0.04;
        orbit.rotation.y -= dt * 0.1;
        orbit.rotation.x += (1.12 + targetY * 0.6 - orbit.rotation.x) * 0.04;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();

      cleanupFns.push(() => {
        cancelAnimationFrame(raf);
        pmrem.dispose();
        envTex.dispose();
        ringTex.dispose();
        torus.geometry.dispose();
        torus.material.dispose();
        orbit.geometry.dispose();
        orbit.material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      });
    });

    return () => {
      disposed = true;
      if (window.cancelIdleCallback && typeof idleId === "number") {
        window.cancelIdleCallback(idleId);
      }
      cleanupFns.forEach((fn) => fn());
    };
  }, [reduce]);

  if (fallback) {
    return (
      <Guilloche className={`pointer-events-none ${className} text-bone`} />
    );
  }
  return <div ref={host} className={`pointer-events-none ${className}`} aria-hidden="true" />;
}
