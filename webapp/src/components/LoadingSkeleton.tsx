interface LoadingSkeletonProps {
  count?: number;
}

export function LoadingSkeleton({ count = 3 }: LoadingSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
        >
          <div className="flex gap-3">
            <div className="w-16 h-16 rounded-lg skeleton flex-shrink-0"></div>
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-20 rounded"></div>
              <div className="skeleton h-5 w-3/4 rounded"></div>
              <div className="flex gap-1">
                <div className="skeleton h-4 w-16 rounded"></div>
                <div className="skeleton h-4 w-12 rounded"></div>
              </div>
              <div className="flex justify-between pt-1">
                <div className="skeleton h-6 w-16 rounded"></div>
                <div className="skeleton h-4 w-24 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
