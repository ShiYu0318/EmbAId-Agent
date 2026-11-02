// Hero particle field: raw WebGL, no dependencies.
// Particles morph between three shapes that mirror the product flow:
// scattered documents (ingest) → knowledge sphere (index) → chat bubble (answer).
(() => {
  const canvas = document.querySelector("[data-hero-canvas]");
  if (!canvas) return;
  const stageItems = [...document.querySelectorAll("[data-hero-stage] [data-stage]")];
  const hero = canvas.closest(".hero");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: false });
  if (!gl) {
    hero?.classList.add("hero--static");
    return;
  }

  // ---------- shape generators ----------
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const gauss = () => {
    const u = rand() || 1e-6;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  const cores = navigator.hardwareConcurrency || 4;
  const small = window.innerWidth < 760;
  const COUNT = small ? 6500 : cores <= 4 ? 9000 : 15000;

  // Three stacked pages, the front one facing the viewer: dog-eared outline,
  // a title bar, an image block and lines of body text read clearly as a document.
  const docs = (n) => {
    const out = new Float32Array(n * 3);
    const W = 1.0;
    const H = 1.32;
    const ear = 0.2;
    const pages = [
      { share: 0.56, x: 0.12, y: -0.02, z: 0.3, rz: 0.0 },
      { share: 0.26, x: -0.22, y: 0.08, z: -0.05, rz: 0.07 },
      { share: 0.18, x: -0.5, y: 0.16, z: -0.38, rz: 0.13 },
    ];
    const lines = [-0.02, -0.12, -0.22, -0.32, -0.42, -0.52];
    const outline = () => {
      // perimeter with the top-right corner folded
      const segs = [
        [[-W / 2, H / 2], [W / 2 - ear, H / 2]],
        [[W / 2 - ear, H / 2], [W / 2, H / 2 - ear]],
        [[W / 2, H / 2 - ear], [W / 2, -H / 2]],
        [[W / 2, -H / 2], [-W / 2, -H / 2]],
        [[-W / 2, -H / 2], [-W / 2, H / 2]],
        [[W / 2 - ear, H / 2], [W / 2 - ear, H / 2 - ear]],
        [[W / 2 - ear, H / 2 - ear], [W / 2, H / 2 - ear]],
      ];
      const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
      let t = rand() * lens.reduce((x, y) => x + y, 0);
      for (let k = 0; k < segs.length; k++) {
        if (t <= lens[k]) {
          const [a, b] = segs[k];
          const u = t / lens[k];
          return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        }
        t -= lens[k];
      }
      return [-W / 2, -H / 2];
    };
    const fill = (x0, y0, w, h) => [x0 + rand() * w, y0 + rand() * h];
    let i = 0;
    pages.forEach((page, idx) => {
      const count = idx === pages.length - 1 ? n - i : Math.floor(n * page.share);
      const front = idx === 0;
      for (let k = 0; k < count; k++, i++) {
        const r = rand();
        let x;
        let y;
        if (r < (front ? 0.2 : 0.55)) [x, y] = outline();
        else if (r < (front ? 0.32 : 0.7)) [x, y] = fill(-W / 2 + 0.1, H / 2 - 0.24, 0.5, 0.07);
        else if (r < (front ? 0.5 : 0.8)) [x, y] = fill(-W / 2 + 0.1, 0.06, W - 0.2, 0.32);
        else {
          const row = Math.floor(rand() * lines.length);
          const len = row === lines.length - 1 ? 0.55 : 0.8 + ((row * 7) % 5) / 25;
          x = -W / 2 + 0.1 + rand() * (W - 0.2) * len;
          y = lines[row] + (rand() - 0.5) * 0.014;
        }
        const c = Math.cos(page.rz);
        const sn = Math.sin(page.rz);
        out.set([x * c - y * sn + page.x, x * sn + y * c + page.y, page.z + (rand() - 0.5) * 0.012], i * 3);
      }
    });
    return out;
  };

  const sphere = (n) => {
    const out = new Float32Array(n * 3);
    const clusters = Array.from({ length: 7 }, () => {
      const r = 0.25 + rand() * 0.4;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)];
    });
    const golden = Math.PI * (3 - Math.sqrt(5));
    const shell = Math.floor(n * 0.58);
    const inner = Math.floor(n * 0.27);
    for (let i = 0; i < n; i++) {
      let p;
      if (i < shell) {
        const y = 1 - (i / (shell - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = golden * i;
        const R = 1.05 + (rand() - 0.5) * 0.02;
        p = [Math.cos(th) * r * R, y * R, Math.sin(th) * r * R];
      } else if (i < shell + inner) {
        const c = clusters[i % clusters.length];
        p = [c[0] + gauss() * 0.085, c[1] + gauss() * 0.085, c[2] + gauss() * 0.085];
      } else {
        const a = rand() * Math.PI * 2;
        const R = 1.36 + rand() * 0.08;
        let x = Math.cos(a) * R;
        let y = (rand() - 0.5) * 0.015;
        let z = Math.sin(a) * R;
        const tx = 0.38;
        [y, z] = [y * Math.cos(tx) - z * Math.sin(tx), y * Math.sin(tx) + z * Math.cos(tx)];
        const tz = 0.18;
        [x, y] = [x * Math.cos(tz) - y * Math.sin(tz), x * Math.sin(tz) + y * Math.cos(tz)];
        p = [x, y, z];
      }
      out.set(p, i * 3);
    }
    return out;
  };

  const bubble = (n) => {
    const out = new Float32Array(n * 3);
    const W = 2.1;
    const H = 1.28;
    const R = 0.36;
    const cy = 0.1;
    const inside = (x, y) => {
      const qx = Math.abs(x) - (W / 2 - R);
      const qy = Math.abs(y - cy) - (H / 2 - R);
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R < 0;
    };
    const outline = () => {
      // perimeter of the rounded rectangle, plus the tail edges
      if (rand() < 0.12) {
        const t = rand();
        const a = [-0.58, cy - H / 2];
        const tip = [-0.9, cy - H / 2 - 0.36];
        const b = [-0.26, cy - H / 2];
        return rand() < 0.5
          ? [a[0] + (tip[0] - a[0]) * t, a[1] + (tip[1] - a[1]) * t]
          : [tip[0] + (b[0] - tip[0]) * t, tip[1] + (b[1] - tip[1]) * t];
      }
      const sw = W - 2 * R;
      const sh = H - 2 * R;
      const arc = (Math.PI / 2) * R;
      const total = 2 * sw + 2 * sh + 4 * arc;
      let t = rand() * total;
      const corners = [
        [W / 2 - R, cy + H / 2 - R, 0],
        [-W / 2 + R, cy + H / 2 - R, Math.PI / 2],
        [-W / 2 + R, cy - H / 2 + R, Math.PI],
        [W / 2 - R, cy - H / 2 + R, (3 * Math.PI) / 2],
      ];
      const edges = [
        [sw, (u) => [W / 2 - R - u, cy + H / 2]],
        [sh, (u) => [-W / 2, cy + H / 2 - R - u]],
        [sw, (u) => [-W / 2 + R + u, cy - H / 2]],
        [sh, (u) => [W / 2, cy - H / 2 + R + u]],
      ];
      for (let s = 0; s < 4; s++) {
        const [cx, cyy, a0] = corners[s];
        if (t < arc) {
          const a = a0 + t / R;
          return [cx + Math.cos(a) * R, cyy + Math.sin(a) * R];
        }
        t -= arc;
        if (t < edges[s][0]) return edges[s][1](t);
        t -= edges[s][0];
      }
      return [W / 2, cy];
    };
    for (let i = 0; i < n; i++) {
      const pick = rand();
      let x;
      let y;
      let z = (rand() - 0.5) * 0.06;
      if (pick < 0.42) {
        [x, y] = outline();
        z = (rand() < 0.5 ? -1 : 1) * 0.04 + (rand() - 0.5) * 0.02;
      } else if (pick < 0.72) {
        do {
          x = (rand() - 0.5) * W;
          y = cy + (rand() - 0.5) * H;
        } while (!inside(x, y));
        z *= 0.6;
      } else {
        const dot = Math.floor(rand() * 3) - 1;
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 0.13;
        x = dot * 0.46 + Math.cos(a) * r;
        y = cy + Math.sin(a) * r;
        z *= 1.4;
      }
      out.set([x, y, z], i * 3);
    }
    return out;
  };

  // ---------- 2D path helpers for the outline-style shapes ----------
  const arc = (cx, cy, rx, ry, a0, a1, steps = 48) =>
    Array.from({ length: steps + 1 }, (_, k) => {
      const a = a0 + ((a1 - a0) * k) / steps;
      return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    });
  const quad = (p0, c, p1, steps = 32) =>
    Array.from({ length: steps + 1 }, (_, k) => {
      const t = k / steps;
      const m = 1 - t;
      return [m * m * p0[0] + 2 * m * t * c[0] + t * t * p1[0], m * m * p0[1] + 2 * m * t * c[1] + t * t * p1[1]];
    });
  // Uniform random point along a set of polylines, weighted by length.
  const along = (polys) => {
    const segs = [];
    let total = 0;
    for (const pts of polys) {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1];
        const b = pts[k];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len > 0) {
          segs.push([a, b, total, len]);
          total += len;
        }
      }
    }
    return () => {
      const t = rand() * total;
      let lo = 0;
      let hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segs[mid][2] <= t) lo = mid;
        else hi = mid - 1;
      }
      const [a, b, s0, len] = segs[lo];
      const u = Math.min(1, (t - s0) / len);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
  };
  const inside = (poly, x, y) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  // Spread a stroke into a soft band so outlines read at a distance.
  const thick = (pick, w) => () => {
    const [x, y] = pick();
    return [x + gauss() * w, y + gauss() * w];
  };
  // Fill n points by drawing from weighted parts; each part returns [x, y, z].
  const compose = (n, parts) => {
    const out = new Float32Array(n * 3);
    const total = parts.reduce((s, p) => s + p[0], 0);
    for (let i = 0; i < n; i++) {
      let r = rand() * total;
      const part = parts.find((p) => (r -= p[0]) < 0) ?? parts[parts.length - 1];
      out.set(part[1](), i * 3);
    }
    return out;
  };

  // Documents get chunked and encoded: a double helix whose rungs are the chunks.
  const helix = (n) => {
    const R = 0.4;
    const turn = 3.1;
    const tilt = -0.28;
    const rot = ([x, y, z]) => [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt), z];
    const strand = (phase) => () => {
      const x = -1.5 + rand() * 3;
      const a = x * turn + phase;
      return rot([x, Math.cos(a) * R + gauss() * 0.012, Math.sin(a) * R + gauss() * 0.012]);
    };
    const rungs = Array.from({ length: 22 }, (_, k) => -1.45 + (k * 2.9) / 21);
    return compose(n, [
      [0.32, strand(0)],
      [0.32, strand(Math.PI)],
      [
        0.3,
        () => {
          const x = rungs[Math.floor(rand() * rungs.length)];
          const a = x * turn;
          const u = rand();
          const y = Math.cos(a) * R * (1 - 2 * u);
          const z = Math.sin(a) * R * (1 - 2 * u);
          return rot([x + gauss() * 0.006, y, z]);
        },
      ],
      [0.06, () => rot([-1.6 + rand() * 3.2, gauss() * 0.5, gauss() * 0.4])],
    ]);
  };

  // Embeddings become an index: a dense knowledge graph of linked nodes.
  const network = (n) => {
    const nodes = [];
    for (let tries = 0; nodes.length < 48 && tries < 9000; tries++) {
      const p = [(rand() * 2 - 1) * 1.5, (rand() * 2 - 1) * 0.95, (rand() * 2 - 1) * 0.32];
      if ((p[0] / 1.5) ** 2 + (p[1] / 0.95) ** 2 > 1) continue;
      if (nodes.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.25)) nodes.push(p);
    }
    const edges = [];
    nodes.forEach((p, i) => {
      nodes
        .map((q, j) => [j, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])])
        .filter(([j]) => j !== i)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .forEach(([j]) => {
          if (!edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]);
        });
    });
    const degree = nodes.map((_, i) => edges.filter(([a, b]) => a === i || b === i).length);
    return compose(n, [
      [
        0.42,
        () => {
          const i = Math.floor(rand() * nodes.length);
          const R = 0.032 + degree[i] * 0.008;
          const a = rand() * Math.PI * 2;
          const r = rand() < 0.4 ? R + gauss() * 0.005 : Math.sqrt(rand()) * R * 0.55;
          const p = nodes[i];
          return [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, p[2]];
        },
      ],
      [
        0.55,
        () => {
          const [a, b] = edges[Math.floor(rand() * edges.length)];
          const u = rand();
          const p = nodes[a];
          const q = nodes[b];
          return [p[0] + (q[0] - p[0]) * u + gauss() * 0.004, p[1] + (q[1] - p[1]) * u + gauss() * 0.004, p[2] + (q[2] - p[2]) * u];
        },
      ],
      [0.03, () => [gauss() * 0.9, gauss() * 0.55, gauss() * 0.3]],
    ]);
  };

  // Retrieval: a magnifying glass over lines of text.
  const magnifier = (n) => {
    const cx = -0.28;
    const cy = 0.26;
    const R = 0.68;
    const hx0 = cx + Math.cos(-Math.PI / 4) * (R + 0.06);
    const hy0 = cy + Math.sin(-Math.PI / 4) * (R + 0.06);
    const hx1 = 0.98;
    const hy1 = -1.0;
    const lines = [
      [cy + 0.3, 0.7],
      [cy + 0.12, 0.95],
      [cy - 0.06, 0.6, true],
      [cy - 0.24, 0.85],
    ];
    return compose(n, [
      [
        0.38,
        () => {
          const a = rand() * Math.PI * 2;
          const r = R + (rand() - 0.5) * 0.1;
          return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, (rand() - 0.5) * 0.08];
        },
      ],
      [
        0.28,
        () => {
          const u = rand();
          const w = (rand() - 0.5) * 0.15;
          const len = Math.hypot(hx1 - hx0, hy1 - hy0);
          const nx = -(hy1 - hy0) / len;
          const ny = (hx1 - hx0) / len;
          return [hx0 + (hx1 - hx0) * u + nx * w, hy0 + (hy1 - hy0) * u + ny * w, (rand() - 0.5) * 0.12];
        },
      ],
      [
        0.24,
        () => {
          const [y, len, hot] = lines[Math.floor(rand() * lines.length)];
          const x = cx - R * 0.68 + rand() * R * 1.36 * len;
          return [x, y + (rand() - 0.5) * (hot ? 0.07 : 0.025), 0.02];
        },
      ],
      [
        0.1,
        () => {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * R * 0.95;
          return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.16 * (1 - (r / R) ** 2)];
        },
      ],
    ]);
  };

  // Agentic reasoning: a 3D brain seen from the side — frontal, parietal and temporal
  // lobes traced by thin gyri, the lateral fissure, cerebellum and brain stem.
  const brain = (n) => {
    const yaw = -0.32;
    const pitch = 0.1;
    const view = ([x, y, z]) => {
      const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
      const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
      return [x1, y * Math.cos(pitch) - z1 * Math.sin(pitch), y * Math.sin(pitch) + z1 * Math.cos(pitch)];
    };
    const fold = (x, y, z) =>
      Math.sin(11 * x + 3.4 * Math.sin(8 * y)) + Math.sin(10.5 * y + 3 * Math.sin(9 * z)) + Math.sin(11 * z + 3.2 * Math.sin(7.5 * x));
    const onSurface = (cx, cy, cz, ax, ay, az, keep) => {
      for (let tries = 0; tries < 400; tries++) {
        let dx = gauss();
        let dy = gauss();
        let dz = gauss();
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        const x = cx + dx * ax;
        const y = cy + dy * ay;
        const z = cz + dz * az;
        if (dz < -0.15) continue; // only the half facing the viewer, so folds don't overlap
        if (keep && !keep(x, y, z)) continue;
        // keep the thin contour lines of the fold field, plus a faint skin
        if (Math.abs(fold(x, y, z)) > 0.17 && rand() > 0.05) continue;
        return [x, y, z];
      }
      // rare fallback: a plain surface point, never a shared spot that would glow
      const a = rand() * Math.PI * 2;
      return [cx + Math.cos(a) * ax, cy + Math.sin(a) * ay, cz + az * 0.5];
    };
    // the lateral fissure splits the temporal lobe from the rest of the cerebrum
    const fissure = (x, y) => y - (-0.12 + (x - 0.1) * 0.32);
    const cerebrum = () =>
      view(onSurface(0, 0.1, 0.12, 0.98, 0.6, 0.42, (x, y) => !(Math.abs(fissure(x, y)) < 0.035 && x > -0.35)));
    const temporal = () => view(onSurface(0.18, -0.26, 0.2, 0.58, 0.24, 0.32, (x, y) => fissure(x, y) < -0.03));
    const fissureLine = () => {
      const x = -0.35 + rand() * 0.95;
      return view([x, -0.12 + (x - 0.1) * 0.32 + gauss() * 0.008, 0.48]);
    };
    // the silhouette: the cerebrum's outline in the side view, drawn crisply
    const rim = () => {
      const a = rand() * Math.PI * 2;
      const y = 0.1 + Math.sin(a) * 0.6;
      const lift = y < -0.05 && Math.cos(a) > -0.2 ? 0.05 : 0;
      return view([Math.cos(a) * 0.99, y - lift, 0.12 + gauss() * 0.02]);
    };
    const cerebellum = () => {
      for (;;) {
        const dx = gauss();
        const dy = gauss();
        const dz = gauss();
        const len = Math.hypot(dx, dy, dz) || 1;
        if (dz / len < -0.15) continue;
        const y = -0.44 + (dy / len) * 0.2;
        // fine horizontal folia
        if (Math.abs(Math.sin(y * 60)) > 0.4 && rand() > 0.15) continue;
        return view([-0.62 + (dx / len) * 0.32, y, (dz / len) * 0.42]);
      }
    };
    const stem = () => {
      const u = rand();
      const a = rand() * Math.PI * 2;
      return view([-0.28 + u * 0.08 + Math.cos(a) * 0.07, -0.42 - u * 0.48, Math.sin(a) * 0.09]);
    };
    return compose(n, [
      [0.56, cerebrum],
      [0.14, temporal],
      [0.1, rim],
      [0.05, fissureLine],
      [0.12, cerebellum],
      [0.03, stem],
    ]);
  };

  // Verified, grounded answers: a shield with a check mark.
  const shield = (n) => {
    const right = [[0, 1.02], ...quad([0, 1.02], [0.4, 0.98], [0.8, 0.84], 16), [0.8, 0.2], ...quad([0.8, 0.2], [0.76, -0.62], [0, -1.05], 40)];
    const poly = [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
    const closed = [...poly, poly[0]];
    const outer = along([closed]);
    const innerPick = along([closed.map(([x, y]) => [x * 0.84, y * 0.84 + 0.02])]);
    const check = along([
      [
        [-0.36, 0.0],
        [-0.08, -0.3],
        [0.42, 0.34],
      ],
    ]);
    return compose(n, [
      [0.32, () => [...thick(outer, 0.014)(), (rand() - 0.5) * 0.05]],
      [0.14, () => [...innerPick(), 0.03]],
      [0.32, () => [...thick(check, 0.045)(), 0.14 + (rand() - 0.5) * 0.06]],
      [
        0.22,
        () => {
          let x;
          let y;
          do {
            x = (rand() * 2 - 1) * 0.8;
            y = -1.05 + rand() * 2.07;
          } while (!inside(poly, x, y));
          return [x, y, 0.12 * (1 - x * x)];
        },
      ],
    ]);
  };

  // Embedded on any site: a browser window with the assistant launcher in the corner.
  const browser = (n) => {
    const W = 2.3;
    const H = 1.45;
    const L = -W / 2;
    const T = H / 2 + 0.05;
    const B = T - H;
    const r = 0.1;
    const frame = along([
      [
        ...arc(L + r, T - r, r, r, Math.PI / 2, Math.PI, 8),
        ...arc(L + r, B + r, r, r, Math.PI, Math.PI * 1.5, 8),
        ...arc(-L - r, B + r, r, r, Math.PI * 1.5, Math.PI * 2, 8),
        ...arc(-L - r, T - r, r, r, 0, Math.PI / 2, 8),
        [L + r, T],
      ],
      [
        [L, T - 0.22],
        [-L, T - 0.22],
      ],
    ]);
    const url = along([
      [
        [L + 0.6, T - 0.07],
        [-L - 0.3, T - 0.07],
        [-L - 0.3, T - 0.15],
        [L + 0.6, T - 0.15],
        [L + 0.6, T - 0.07],
      ],
    ]);
    const lines = [T - 0.62, T - 0.74, T - 0.86, T - 0.98];
    const box = (x0, y0, w, h) => () => [x0 + rand() * w, y0 - rand() * h, 0];
    const lx = -L - 0.2;
    const ly = B + 0.12;
    return compose(n, [
      [0.3, () => [...thick(frame, 0.01)(), 0]],
      [
        0.05,
        () => {
          const k = Math.floor(rand() * 3);
          const a = rand() * Math.PI * 2;
          const rr = Math.sqrt(rand()) * 0.035;
          return [L + 0.15 + k * 0.12 + Math.cos(a) * rr, T - 0.11 + Math.sin(a) * rr, 0];
        },
      ],
      [0.06, () => [...url(), 0]],
      [0.08, box(L + 0.16, T - 0.36, 0.8, 0.1)],
      [
        0.17,
        () => {
          const k = Math.floor(rand() * lines.length);
          const len = k === lines.length - 1 ? 0.5 : 0.85;
          return [L + 0.16 + rand() * 1.05 * len, lines[k] + (rand() - 0.5) * 0.018, 0];
        },
      ],
      [0.1, box(-L - 0.95, T - 0.36, 0.78, 0.66)],
      [0.02, box(L + 0.05, T - 0.25, W - 0.1, H - 0.3)],
      [
        0.12,
        () => {
          const a = rand() * Math.PI * 2;
          const rr = 0.27 + gauss() * 0.012;
          return [lx + Math.cos(a) * rr, ly + Math.sin(a) * rr, 0.22];
        },
      ],
      [
        0.1,
        () => {
          // a small speech bubble inside the launcher: rounded box + three dots
          if (rand() < 0.55) {
            const u = rand() * 4;
            const side = Math.floor(u);
            const v = u - side;
            const w = 0.15;
            const h = 0.1;
            const pts = [
              [-w + 2 * w * v, h],
              [w, h - 2 * h * v],
              [w - 2 * w * v, -h],
              [-w, -h + 2 * h * v],
            ];
            return [lx + pts[side][0] + gauss() * 0.006, ly + 0.02 + pts[side][1] + gauss() * 0.006, 0.24];
          }
          const k = Math.floor(rand() * 3);
          return [lx - 0.07 + k * 0.07 + gauss() * 0.012, ly + 0.02 + gauss() * 0.012, 0.24];
        },
      ],
    ]);
  };

  // Reaching everywhere: a barred spiral the size of the Milky Way. Stored flat in xy;
  // the vertex shader spins it (inner stars faster) and tilts it toward the camera.
  const galaxy = (n) => {
    const spiral = (offset, spread, rMin) => () => {
      const r = rMin + Math.pow(rand(), 0.9) * (1.5 - rMin);
      const a = offset + Math.log(r / rMin) * 2.9 + gauss() * spread * (0.5 + r * 0.4);
      const rr = r * (1 + gauss() * 0.03);
      return [Math.cos(a) * rr, Math.sin(a) * rr, gauss() * 0.028];
    };
    const bar = 0.45;
    return compose(n, [
      [
        0.2,
        () => {
          const x = gauss() * 0.26;
          const y = gauss() * 0.085;
          return [x * Math.cos(bar) - y * Math.sin(bar), x * Math.sin(bar) + y * Math.cos(bar), gauss() * 0.09];
        },
      ],
      [0.26, spiral(bar, 0.06, 0.28)],
      [0.26, spiral(bar + Math.PI, 0.06, 0.28)],
      [0.08, spiral(bar + Math.PI / 2, 0.11, 0.42)],
      [0.08, spiral(bar + (Math.PI * 3) / 2, 0.11, 0.42)],
      [
        0.11,
        () => {
          const r = 0.2 + Math.pow(rand(), 0.65) * 1.5;
          const a = rand() * Math.PI * 2;
          return [Math.cos(a) * r, Math.sin(a) * r, gauss() * 0.05];
        },
      ],
      [0.03, () => [gauss() * 0.95, gauss() * 0.95, gauss() * 0.45]],
    ]);
  };

  // The loop: the whole web as a galaxy → your website → documents come in → indexed as a graph →
  // retrieved → answered → verified → reasoned over by the agent → encoded → your knowledge world.
  const shapes = [
    galaxy(COUNT),
    browser(COUNT),
    docs(COUNT),
    network(COUNT),
    magnifier(COUNT),
    bubble(COUNT),
    shield(COUNT),
    brain(COUNT),
    helix(COUNT),
    sphere(COUNT),
  ];
  const GALAXY = 0;
  // Which intro caption (匯入來源 / 建立索引 / 檢索推理 / 生成回答) each shape stands for.
  const STAGE_OF = [3, 0, 0, 1, 2, 3, 3, 2, 1, 1];
  const meta = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    const sparkle = rand() < 0.03;
    meta.set(
      [rand(), sparkle ? 1.7 + rand() * 0.6 : 0.6 + rand() * 0.9, sparkle ? 1 : Math.pow(rand(), 2.4), rand()],
      i * 4,
    );
  }

  // ---------- GL program ----------
  const vert = `
    attribute vec3 aFrom; attribute vec3 aTo; attribute vec4 aR;
    uniform mat4 uProj; uniform mat4 uMV;
    uniform float uT; uniform float uTime; uniform float uGalFrom; uniform float uGalTo; uniform float uGalT;
    uniform vec2 uMouse; uniform float uMouseOn; uniform float uScatter; uniform float uPx; uniform float uAspect;
    uniform vec3 uC1; uniform vec3 uC2;
    varying vec3 vColor; varying float vAlpha;
    vec3 galaxySpin(vec3 q){
      float r = length(q.xy);
      float a = uGalT * (.14 + .13 / (.45 + r));
      float c = cos(a); float s = sin(a);
      q.xy = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
      float t = .9;
      return vec3(q.x, q.y * cos(t) - q.z * sin(t), q.y * sin(t) + q.z * cos(t));
    }
    float ease(float t){ return t < .5 ? 4.*t*t*t : 1. - pow(-2.*t + 2., 3.) / 2.; }
    void main(){
      float t = clamp((uT - aR.w * .45) / .55, 0., 1.);
      float e = ease(t);
      vec3 p = mix(mix(aFrom, galaxySpin(aFrom), uGalFrom), mix(aTo, galaxySpin(aTo), uGalTo), e);
      vec3 dir = normalize(vec3(sin(aR.x * 129.9), cos(aR.x * 78.2), sin(aR.x * 37.7)) + 1e-4);
      p += dir * sin(3.14159 * e) * .2;
      float s = aR.x * 6.2831;
      p += .014 * vec3(sin(uTime * .7 + s), cos(uTime * .9 + s * 1.3), sin(uTime * .6 + s * .7));
      p += dir * uScatter * (.8 + aR.x * 2.2);
      vec4 mv = uMV * vec4(p, 1.);
      vec4 clip = uProj * mv;
      vec2 delta = (clip.xy / clip.w - uMouse) * vec2(uAspect, 1.);
      float f = uMouseOn * smoothstep(.16, 0., length(delta));
      mv.xy += normalize(delta + 1e-5) * f * .05;
      gl_Position = uProj * mv;
      gl_PointSize = uPx * aR.y * (1. + f * .35) * (4.2 / -mv.z);
      vColor = mix(uC1, uC2, clamp(aR.z + f * .35, 0., 1.));
      vAlpha = mix(.3, 1., smoothstep(-5.6, -3.2, mv.z)) * (1. - uScatter * .9);
    }`;
  const frag = `
    precision mediump float;
    varying vec3 vColor; varying float vAlpha;
    void main(){
      float r = length(gl_PointCoord - .5);
      float a = (smoothstep(.5, .32, r) * .75 + smoothstep(.5, .0, r) * .45) * vAlpha;
      if (a < .01) discard;
      gl_FragColor = vec4(vColor, a);
    }`;

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
    return sh;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link");
  } catch {
    hero?.classList.add("hero--static");
    return;
  }
  gl.useProgram(program);

  const attr = (name, data, size) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr("aR", meta, 4);
  // One buffer per shape; a morph just re-points aFrom/aTo at two of them.
  const buffers = shapes.map((data) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  });
  const locFrom = gl.getAttribLocation(program, "aFrom");
  const locTo = gl.getAttribLocation(program, "aTo");
  gl.enableVertexAttribArray(locFrom);
  gl.enableVertexAttribArray(locTo);
  const bindShape = (loc, i) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[i]);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  };
  // ?shape=N pins the loop on one shape (handy when reviewing a single form).
  const pinned = Number.parseInt(new URLSearchParams(location.search).get("shape") ?? "", 10);
  const PIN = Number.isInteger(pinned) && pinned >= 0 && pinned < shapes.length ? pinned : -1;
  bindShape(locFrom, Math.max(0, PIN));
  bindShape(locTo, Math.max(0, PIN));

  const u = Object.fromEntries(
    ["uProj", "uMV", "uT", "uTime", "uGalFrom", "uGalTo", "uGalT", "uMouse", "uMouseOn", "uScatter", "uPx", "uAspect", "uC1", "uC2"].map(
      (n) => [n, gl.getUniformLocation(program, n)],
    ),
  );

  // ---------- matrices ----------
  const perspective = (fov, aspect, near, far) => {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  };
  const modelView = (rx, ry, ty, scale, dist) => {
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    // R = Rx * Ry, column-major, then translate (0, ty, -dist)
    return new Float32Array([
      cy * scale, sx * sy * scale, -cx * sy * scale, 0,
      0, cx * scale, sx * scale, 0,
      sy * scale, -sx * cy * scale, cx * cy * scale, 0,
      0, ty, -dist, 1,
    ]);
  };

  // ---------- state ----------
  const HOLD = 2900;
  const MORPH = 2200;
  let from = Math.max(0, PIN);
  let to = from;
  let morphStart = -1;
  let galStart = 0;
  let phaseStart = 0;
  let width = 0;
  let height = 0;
  let aspect = 1;
  let running = false;
  let visible = true;
  let raf = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0, on: 0, ton: 0 };
  let scatter = reduceMotion ? 0 : 1;
  let scatterTarget = 0;
  const start = performance.now();

  const setStage = (shape) => {
    stageItems.forEach((el, k) => el.toggleAttribute("data-active", k === STAGE_OF[shape]));
  };
  setStage(from);

  const theme = () => {
    const light = document.documentElement.dataset.theme === "light";
    if (light) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform3f(u.uC1, 0.05, 0.2, 0.92);
      gl.uniform3f(u.uC2, 0.06, 0.08, 0.2);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform3f(u.uC1, 0.09, 0.26, 1.0);
      gl.uniform3f(u.uC2, 0.82, 0.88, 1.0);
    }
  };
  gl.enable(gl.BLEND);
  theme();
  new MutationObserver(() => {
    theme();
    if (!running) draw(performance.now());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
    aspect = width / height;
    gl.viewport(0, 0, width, height);
    gl.uniformMatrix4fv(u.uProj, false, perspective((34 * Math.PI) / 180, aspect, 0.1, 50));
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1f(u.uPx, (small ? 2.3 : 2.1) * dpr * Math.min(1.25, Math.max(0.8, rect.height / 820)));
    if (!running) draw(performance.now());
  };

  function draw(now) {
    const time = (now - start) / 1000;
    let t = 1;
    if (!reduceMotion) {
      // The galaxy holds longer so its rotation has time to read.
      if (PIN < 0 && morphStart < 0 && now - phaseStart > (from === GALAXY ? 5600 : HOLD)) {
        to = (from + 1) % shapes.length;
        bindShape(locTo, to);
        morphStart = now;
        if (to === GALAXY) galStart = now;
        setStage(to);
      }
      if (morphStart >= 0) {
        t = Math.min(1, (now - morphStart) / MORPH);
        if (t >= 1) {
          from = to;
          bindShape(locFrom, from);
          morphStart = -1;
          phaseStart = now;
        }
      }
    }
    mouse.x += (mouse.tx - mouse.x) * 0.08;
    mouse.y += (mouse.ty - mouse.y) * 0.08;
    mouse.on += (mouse.ton - mouse.on) * 0.06;
    scatter += (scatterTarget - scatter) * 0.06;

    const sway = reduceMotion ? 0 : Math.sin(time * 0.22) * 0.38;
    const fit = aspect < 0.8 ? 0.5 : aspect < 1.4 ? 0.86 : 1;
    const lift = 0.04;
    gl.uniformMatrix4fv(u.uMV, false, modelView(0.12 + mouse.y * -0.16, sway + mouse.x * 0.32, lift, fit, 4.6));
    gl.uniform1f(u.uT, t);
    const target = morphStart >= 0 ? to : from;
    gl.uniform1f(u.uGalFrom, from === GALAXY ? 1 : 0);
    gl.uniform1f(u.uGalTo, target === GALAXY ? 1 : 0);
    gl.uniform1f(u.uGalT, reduceMotion || (from !== GALAXY && target !== GALAXY) ? 0 : (now - galStart) / 1000);
    gl.uniform1f(u.uTime, reduceMotion ? 0 : time);
    gl.uniform2f(u.uMouse, mouse.x, mouse.y);
    gl.uniform1f(u.uMouseOn, mouse.on);
    gl.uniform1f(u.uScatter, scatter);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, COUNT);
  }

  const loop = (now) => {
    draw(now);
    raf = requestAnimationFrame(loop);
  };
  const play = () => {
    if (running || reduceMotion || !visible || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const pause = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    mouse.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.ty = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    mouse.ton = e.clientY < rect.bottom ? 1 : 0;
  });
  document.documentElement.addEventListener("pointerleave", () => (mouse.ton = 0));

  window.addEventListener(
    "scroll",
    () => {
      const h = hero.offsetHeight || window.innerHeight;
      scatterTarget = Math.min(1, Math.max(0, window.scrollY / (h * 0.85)));
      if (reduceMotion) {
        scatter = 0;
        return;
      }
    },
    { passive: true },
  );

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? play() : pause();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  new ResizeObserver(resize).observe(canvas);

  resize();
  phaseStart = performance.now();
  galStart = phaseStart;
  canvas.classList.add("is-ready");
  play();
})();
