import { useRef, type ReactElement } from "react";

export const RenderCount = (props: { readonly label: string }): ReactElement => {
  const count = useRef(0);
  count.current += 1;
  return (
    <span className="render-count">
      {props.label} rendered {count.current} times
    </span>
  );
};
