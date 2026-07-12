// Deterministic generator for the enriched sample dataset used by the "Usar
// datos de ejemplo" button and the single-table eval battery
// (public/sample-data/ventas.csv). It also prints every aggregate that
// src/lib/eval-cases.ts pins, so the CSV and the expected values stay in sync.
//
// Run:  node scripts/gen-sample.mjs           (writes the CSV in place)
//       node scripts/gen-sample.mjs out.csv   (writes elsewhere)
//
// The output is fully deterministic (seeded PRNG), so regenerating reproduces
// the exact same file — change the seed or dimensions and re-copy the printed
// numbers into eval-cases.ts.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// --- seeded PRNG (mulberry32) for reproducibility ---
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260712);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// --- dimensions ---
// Each client has a fixed city, region, account rep (vendedor) and a primary
// category, so region/ciudad/vendedor correlate cleanly for rollup questions.
const CLIENTS = [
  { cliente: "Constructora Lumen", ciudad: "Monterrey", region: "Norte", vendedor: "Ana Torres", primary: "Materiales" },
  { cliente: "Ferreteria del Norte", ciudad: "Monterrey", region: "Norte", vendedor: "Ana Torres", primary: "Materiales" },
  { cliente: "Aceros Coahuila", ciudad: "Saltillo", region: "Norte", vendedor: "Ana Torres", primary: "Materiales" },
  { cliente: "Grupo Aranda", ciudad: "CDMX", region: "Centro", vendedor: "Luis Prado", primary: "Electronica" },
  { cliente: "Corporativo Zenit", ciudad: "CDMX", region: "Centro", vendedor: "Luis Prado", primary: "Electronica" },
  { cliente: "Distribuidora Vela", ciudad: "Puebla", region: "Centro", vendedor: "Marta Solis", primary: "Alimentos" },
  { cliente: "Comercial Rios", ciudad: "Queretaro", region: "Centro", vendedor: "Marta Solis", primary: "Alimentos" },
  { cliente: "Tecno Solutions", ciudad: "Guadalajara", region: "Occidente", vendedor: "Diego Ramos", primary: "Electronica" },
  { cliente: "Innova Bajio", ciudad: "Leon", region: "Occidente", vendedor: "Diego Ramos", primary: "Materiales" },
  { cliente: "Peninsular Trade", ciudad: "Merida", region: "Sureste", vendedor: "Sofia Lara", primary: "Alimentos" },
];

// producto -> categoria, precio_unitario, costo_unitario, unit range.
// Prices match the original sample so monto stays continuous with prior demos.
const PRODUCTS = {
  // Materiales
  Cemento: { categoria: "Materiales", precio: 150, costo: 110, lo: 90, hi: 160 },
  Varilla: { categoria: "Materiales", precio: 180, costo: 130, lo: 70, hi: 120 },
  Pintura: { categoria: "Materiales", precio: 170, costo: 120, lo: 35, hi: 60 },
  "Tubo PVC": { categoria: "Materiales", precio: 120, costo: 80, lo: 50, hi: 90 },
  Grava: { categoria: "Materiales", precio: 90, costo: 55, lo: 100, hi: 200 },
  // Electronica
  "Router WiFi": { categoria: "Electronica", precio: 650, costo: 430, lo: 12, hi: 35 },
  Laptop: { categoria: "Electronica", precio: 12000, costo: 9200, lo: 3, hi: 9 },
  Monitor: { categoria: "Electronica", precio: 1500, costo: 1000, lo: 8, hi: 20 },
  Teclado: { categoria: "Electronica", precio: 250, costo: 150, lo: 20, hi: 45 },
  "Disco SSD": { categoria: "Electronica", precio: 900, costo: 620, lo: 10, hi: 30 },
  // Alimentos
  Aceite: { categoria: "Alimentos", precio: 45, costo: 30, lo: 150, hi: 230 },
  Azucar: { categoria: "Alimentos", precio: 44, costo: 29, lo: 150, hi: 200 },
  Harina: { categoria: "Alimentos", precio: 45, costo: 29, lo: 140, hi: 180 },
  Arroz: { categoria: "Alimentos", precio: 60, costo: 40, lo: 120, hi: 160 },
  Cafe: { categoria: "Alimentos", precio: 120, costo: 82, lo: 40, hi: 90 },
};
const BY_CAT = {};
for (const [producto, p] of Object.entries(PRODUCTS)) {
  (BY_CAT[p.categoria] ??= []).push(producto);
}
const CATEGORIES = Object.keys(BY_CAT);
const METODOS = ["Transferencia", "Credito", "Efectivo", "Tarjeta"];

// estado weighted: mostly Completada, some Devuelta, few Pendiente.
function pickEstado() {
  const r = rnd();
  if (r < 0.82) return "Completada";
  if (r < 0.94) return "Devuelta";
  return "Pendiente";
}

// pick a category for a client: 65% primary, 35% another (enough mixing that
// every month covers every category, so compound filters are never empty).
function pickCategory(primary) {
  if (rnd() < 0.65) return primary;
  return pick(CATEGORIES.filter((c) => c !== primary));
}

// --- generate rows across all 12 months of 2026 ---
const rows = [];
for (let month = 1; month <= 12; month++) {
  const txThisMonth = randint(16, 22);
  const usedDays = new Set();
  for (let i = 0; i < txThisMonth; i++) {
    let day;
    do {
      day = randint(1, 28);
    } while (usedDays.has(day));
    usedDays.add(day);

    const client = pick(CLIENTS);
    const categoria = pickCategory(client.primary);
    const producto = pick(BY_CAT[categoria]);
    const p = PRODUCTS[producto];
    const unidades = randint(p.lo, p.hi);
    const monto = unidades * p.precio;
    const fecha = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    rows.push({
      fecha,
      region: client.region,
      ciudad: client.ciudad,
      cliente: client.cliente,
      vendedor: client.vendedor,
      categoria,
      producto,
      metodo_pago: pick(METODOS),
      estado: pickEstado(),
      unidades,
      precio_unitario: p.precio,
      costo_unitario: p.costo,
      monto,
    });
  }
}
rows.sort((a, b) => a.fecha.localeCompare(b.fecha));

// --- write CSV ---
const HEADERS = [
  "fecha", "region", "ciudad", "cliente", "vendedor", "categoria", "producto",
  "metodo_pago", "estado", "unidades", "precio_unitario", "costo_unitario", "monto",
];
const csv = [HEADERS.join(",")]
  .concat(rows.map((r) => HEADERS.map((h) => r[h]).join(",")))
  .join("\n") + "\n";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || resolve(here, "..", "public", "sample-data", "ventas.csv");
writeFileSync(OUT, csv);
console.error(`Wrote ${rows.length} rows to ${OUT}`);

// --- compute the aggregates that src/lib/eval-cases.ts pins ---
const sum = (arr, f) => arr.map(f).reduce((a, b) => a + b, 0);
const round2 = (n) => Math.round(n * 100) / 100;
const groupSum = (f, g) => {
  const m = new Map();
  for (const r of rows) m.set(g(r), (m.get(g(r)) || 0) + f(r));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const groupCount = (g) => {
  const m = new Map();
  for (const r of rows) m.set(g(r), (m.get(g(r)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const monthOf = (r) => Number(r.fecha.slice(5, 7));

const totalMonto = sum(rows, (r) => r.monto);
const out = {
  n_rows: rows.length,
  total_monto: totalMonto,
  count: rows.length,
  avg_monto: round2(totalMonto / rows.length),
  max_venta: Math.max(...rows.map((r) => r.monto)),
  distinct_clientes: new Set(rows.map((r) => r.cliente)).size,
  distinct_vendedores: new Set(rows.map((r) => r.vendedor)).size,
  distinct_productos: new Set(rows.map((r) => r.producto)).size,
  distinct_ciudades: new Set(rows.map((r) => r.ciudad)).size,
  distinct_regiones: new Set(rows.map((r) => r.region)).size,
  unidades_total: sum(rows, (r) => r.unidades),
  monto_por_categoria: groupSum((r) => r.monto, (r) => r.categoria),
  count_por_categoria: groupCount((r) => r.categoria),
  monto_por_mes: [...Array(12)].map((_, i) =>
    [i + 1, sum(rows.filter((r) => monthOf(r) === i + 1), (r) => r.monto)]),
  monto_cdmx: sum(rows.filter((r) => r.ciudad === "CDMX"), (r) => r.monto),
  count_monterrey: rows.filter((r) => r.ciudad === "Monterrey").length,
  count_agosto: rows.filter((r) => monthOf(r) === 8).length,
  monto_electronica_agosto: sum(
    rows.filter((r) => r.categoria === "Electronica" && monthOf(r) === 8), (r) => r.monto),
  mejor_cliente: groupSum((r) => r.monto, (r) => r.cliente)[0],
  top_producto: groupSum((r) => r.monto, (r) => r.producto)[0],
  top_vendedor: groupSum((r) => r.monto, (r) => r.vendedor)[0],
  ganancia_total: sum(rows, (r) => r.unidades * (r.precio_unitario - r.costo_unitario)),
  monto_por_metodo: groupSum((r) => r.monto, (r) => r.metodo_pago),
  count_por_estado: groupCount((r) => r.estado),
  count_devueltas: rows.filter((r) => r.estado === "Devuelta").length,
  monto_por_region: groupSum((r) => r.monto, (r) => r.region),
  top_ciudad: groupSum((r) => r.monto, (r) => r.ciudad)[0],
};
console.log(JSON.stringify(out, null, 2));
