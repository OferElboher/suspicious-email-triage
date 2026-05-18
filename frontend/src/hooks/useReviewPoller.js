import { useEffect, useRef } from "react";
import { getJson } from "../api/client";

/** Polls GET /reviews/:id until terminal status (completed/failed). */
export function useReviewPoller(reviewId, onUpdate) {
  const timer = useRef(null);

  useEffect(() => {
    if (!reviewId) return undefined;

    let cancelled = false;

    const tick = async () => {
      try {
        const data = await getJson(`/reviews/${reviewId}`);
        if (cancelled) return;
        onUpdate({ ...data, _polling: !["completed", "failed"].includes(data.status) });
        if (!["completed", "failed"].includes(data.status)) {
          timer.current = setTimeout(tick, 1500);
        }
      } catch {
        if (!cancelled) {
          timer.current = setTimeout(tick, 2000);
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reviewId, onUpdate]);
}
