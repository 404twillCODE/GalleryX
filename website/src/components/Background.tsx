export function Background(): JSX.Element {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-base-bg">
      <div className="absolute inset-0 bg-grid-lines bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_10%,transparent_75%)]" />
      <div className="absolute top-[-10%] left-[8%] w-[520px] h-[520px] rounded-full bg-accent/20 blur-[120px] animate-blob" />
      <div className="absolute top-[10%] right-[4%] w-[420px] h-[420px] rounded-full bg-fuchsia-500/10 blur-[120px] animate-blob-delay" />
      <div className="absolute bottom-[-15%] left-[30%] w-[600px] h-[600px] rounded-full bg-emerald-500/[0.07] blur-[140px] animate-float-slow" />
      <div className="absolute inset-0 bg-radial-fade" />
    </div>
  )
}
