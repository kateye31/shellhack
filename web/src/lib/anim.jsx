import { useRef } from "react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollToPlugin);
gsap.defaults({ ease: "power2.out", duration: 0.45 });

export const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export { gsap, useGSAP };

/** A number that tweens from its previous value to the new one. */
export function CountUp({ value, format = v => Math.round(v).toLocaleString(), duration = 0.8 }) {
  const el = useRef(null);
  const last = useRef(0);
  useGSAP(() => {
    const obj = { v: last.current };
    if (reducedMotion()) { el.current.textContent = format(value); last.current = value; return; }
    gsap.to(obj, {
      v: value, duration, ease: "power3.out",
      onUpdate: () => { if (el.current) el.current.textContent = format(obj.v); },
      onComplete: () => { last.current = value; },
    });
  }, { dependencies: [value] });
  return <span ref={el}>{format(last.current)}</span>;
}
