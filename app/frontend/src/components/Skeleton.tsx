interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className ="" }: SkeletonProps) {
  return (
    <div 
      className={`animate-pulse-slow rounded bg-gradient-to-r from-bg-elevated to-bg-surface bg-[length:200%_200%] animate-border-flow relative overflow-hidden ring-1 ring-border/50 ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/5 to-transparent w-full h-full animate-[spin_3s_linear_infinite]" />
    </div>
  );
}
