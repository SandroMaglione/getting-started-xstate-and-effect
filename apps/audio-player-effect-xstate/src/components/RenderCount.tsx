import { useRef } from "react";

export const useRenderCount = () => {
  const renderCount = useRef(0);

  renderCount.current += 1;

  return renderCount.current;
};

export const RenderCount = ({ count }: { count: number }) => (
  <span className="render-count">{`Renders: ${count}`}</span>
);
