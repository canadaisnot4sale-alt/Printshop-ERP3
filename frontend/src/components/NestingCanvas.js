// 2D nesting visualization. layout: { bin_width, used_length, placements:[{x,y,w,h,label}], sheet_height? }
export default function NestingCanvas({ layout, unit = "in" }) {
  if (!layout || !layout.placements) return null;
  const { bin_width, used_length, placements, sheet_height } = layout;
  const W = 320;
  const scale = W / (bin_width || 1);
  const H = Math.max((used_length || 1) * scale, 40);
  const colors = ["#2495D3", "#0EA5E9", "#38BDF8", "#0284C7", "#1E7AA9", "#7DD3FC"];
  const sheetLines = [];
  if (sheet_height) {
    for (let y = sheet_height; y < used_length; y += sheet_height) {
      sheetLines.push(y * scale);
    }
  }
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-1">
        <span>Layout · {bin_width}" wide</span>
        <span>{used_length}" used</span>
      </div>
      <svg width={W} height={H} className="border border-slate-200 rounded-sm bg-slate-50" data-testid="nesting-canvas">
        {placements.map((p, i) => (
          <g key={i}>
            <rect x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
              fill={colors[i % colors.length]} fillOpacity="0.22" stroke={colors[i % colors.length]} strokeWidth="1" />
            {p.w * scale > 26 && p.h * scale > 12 && (
              <text x={p.x * scale + 3} y={p.y * scale + 12} fontSize="9" fill="#0A0A0A" className="font-mono">
                {p.label || `${p.w}×${p.h}`}
              </text>
            )}
          </g>
        ))}
        {sheetLines.map((y, i) => (
          <line key={`s${i}`} x1="0" y1={y} x2={W} y2={y} stroke="#EF4444" strokeWidth="1" strokeDasharray="4 3" />
        ))}
      </svg>
      {sheet_height && <div className="text-[10px] text-slate-400 mt-1 font-mono">Red dashed = sheet break ({sheet_height}")</div>}
    </div>
  );
}
