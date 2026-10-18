import Decimal from 'decimal.js';
import { Money } from '../money';

/**
 * BỘ TÍNH CÔNG THỨC LƯƠNG — an toàn, không dùng eval.
 * Cú pháp: số (dấu chấm thập phân), biến (CHỮ_HOA_SỐ), + − × ÷ (+ - * /), ngoặc,
 * so sánh (> >= < <= == !=), và hàm: min, max, round(x[, chữ số]), floor, ceil, abs, if(điều kiện, a, b),
 * và các hàm tổng do bên gọi cung cấp (vd SUM_EARNINGS()).
 * Mọi phép tính dùng Decimal — không sai số dấu phẩy động.
 */
type Node =
  | { t: 'num'; v: Decimal }
  | { t: 'var'; name: string }
  | { t: 'neg'; e: Node }
  | { t: 'bin'; op: string; l: Node; r: Node }
  | { t: 'call'; name: string; args: Node[] };

export class FormulaError extends Error {}

const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|[-+*/(),<>]))/y;

function tokenize(src: string): string[] {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new FormulaError(`Ký tự không hợp lệ tại vị trí ${pos + 1}: "${src.slice(pos, pos + 10)}"`);
    out.push(m[1] ?? m[2] ?? m[3]);
    pos = TOKEN.lastIndex;
  }
  return out;
}

const PRECEDENCE: Record<string, number> = { '==': 1, '!=': 1, '<': 2, '<=': 2, '>': 2, '>=': 2, '+': 3, '-': 3, '*': 4, '/': 4 };

/** Phân tích công thức thành cây biểu thức (Pratt parser). */
export function parseFormula(src: string): Node {
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const expect = (t: string) => {
    if (next() !== t) throw new FormulaError(`Thiếu "${t}"`);
  };

  const primary = (): Node => {
    const tok = next();
    if (tok === undefined) throw new FormulaError('Công thức kết thúc đột ngột');
    if (tok === '(') {
      const e = expr(0);
      expect(')');
      return e;
    }
    if (tok === '-') return { t: 'neg', e: primary() };
    if (tok === '+') return primary();
    if (/^\d/.test(tok)) return { t: 'num', v: new Money(tok) };
    if (/^[A-Za-z_]/.test(tok)) {
      if (peek() === '(') {
        next();
        const args: Node[] = [];
        if (peek() !== ')') {
          do args.push(expr(0));
          while (peek() === ',' && next());
        }
        expect(')');
        return { t: 'call', name: tok.toLowerCase(), args };
      }
      return { t: 'var', name: tok.toUpperCase() };
    }
    throw new FormulaError(`Không hiểu "${tok}"`);
  };

  const expr = (minPrec: number): Node => {
    let left = primary();
    for (;;) {
      const op = peek();
      const prec = op !== undefined ? PRECEDENCE[op] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      next();
      left = { t: 'bin', op, l: left, r: expr(prec + 1) };
    }
  };

  const tree = expr(0);
  if (i < tokens.length) throw new FormulaError(`Thừa "${tokens[i]}" ở cuối công thức`);
  return tree;
}

/** Danh sách biến công thức sử dụng (để kiểm tra hợp lệ / thứ tự tính). */
export function formulaVariables(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.t === 'var') out.add(n.name);
    else if (n.t === 'neg') walk(n.e);
    else if (n.t === 'bin') {
      walk(n.l);
      walk(n.r);
    } else if (n.t === 'call') n.args.forEach(walk);
  };
  walk(parseFormula(src));
  return [...out];
}

export type FormulaVars = Record<string, Decimal.Value>;
export type FormulaFns = Record<string, () => Decimal.Value>;

const ONE = () => new Money(1);
const ZERO = () => new Money(0);
const bool = (b: boolean) => (b ? ONE() : ZERO());

export function evaluateNode(n: Node, vars: FormulaVars, fns: FormulaFns = {}): Decimal {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'var': {
      if (!(n.name in vars)) throw new FormulaError(`Biến chưa định nghĩa: ${n.name}`);
      return new Money(vars[n.name]);
    }
    case 'neg':
      return evaluateNode(n.e, vars, fns).neg();
    case 'bin': {
      const l = evaluateNode(n.l, vars, fns);
      const r = evaluateNode(n.r, vars, fns);
      switch (n.op) {
        case '+': return l.plus(r);
        case '-': return l.minus(r);
        case '*': return l.times(r);
        case '/':
          if (r.isZero()) return ZERO(); // chia cho 0 → 0 (vd ngày công chuẩn chưa khai báo)
          return l.div(r);
        case '>': return bool(l.gt(r));
        case '>=': return bool(l.gte(r));
        case '<': return bool(l.lt(r));
        case '<=': return bool(l.lte(r));
        case '==': return bool(l.eq(r));
        case '!=': return bool(!l.eq(r));
      }
      throw new FormulaError(`Toán tử không hỗ trợ: ${n.op}`);
    }
    case 'call': {
      const a = (k: number) => {
        if (!n.args[k]) throw new FormulaError(`Hàm ${n.name} thiếu tham số`);
        return evaluateNode(n.args[k], vars, fns);
      };
      switch (n.name) {
        case 'min': return Decimal.min(...n.args.map((x) => evaluateNode(x, vars, fns)));
        case 'max': return Decimal.max(...n.args.map((x) => evaluateNode(x, vars, fns)));
        case 'round': return a(0).toDecimalPlaces(n.args[1] ? a(1).toNumber() : 0, Decimal.ROUND_HALF_UP);
        case 'floor': return a(0).floor();
        case 'ceil': return a(0).ceil();
        case 'abs': return a(0).abs();
        case 'if': return a(0).isZero() ? a(2) : a(1); // chỉ tính nhánh được chọn
      }
      const fn = fns[n.name] ?? fns[n.name.toUpperCase()];
      if (fn) return new Money(fn());
      throw new FormulaError(`Hàm không hỗ trợ: ${n.name}`);
    }
  }
}

export function evaluateFormula(src: string, vars: FormulaVars, fns: FormulaFns = {}): Decimal {
  return evaluateNode(parseFormula(src), vars, fns);
}

/** Kiểm tra công thức: cú pháp + biến đã biết. Trả về thông báo lỗi hoặc null. */
export function validateFormula(src: string, knownVariables: Set<string>, knownFunctions: string[] = []): string | null {
  try {
    const tree = parseFormula(src);
    const bad = formulaVariables(src).filter((v) => !knownVariables.has(v));
    if (bad.length) return `Biến không tồn tại: ${bad.join(', ')}`;
    const fnNames = new Set(['min', 'max', 'round', 'floor', 'ceil', 'abs', 'if', ...knownFunctions.map((f) => f.toLowerCase())]);
    const badFn: string[] = [];
    const walk = (n: Node) => {
      if (n.t === 'call') {
        if (!fnNames.has(n.name)) badFn.push(n.name);
        n.args.forEach(walk);
      } else if (n.t === 'neg') walk(n.e);
      else if (n.t === 'bin') {
        walk(n.l);
        walk(n.r);
      }
    };
    walk(tree);
    return badFn.length ? `Hàm không hỗ trợ: ${badFn.join(', ')}` : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
