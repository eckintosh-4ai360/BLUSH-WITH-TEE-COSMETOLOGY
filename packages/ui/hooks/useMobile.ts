import * as React from "react";

/**
 * Where the docked sidebar gives way to an overlay.
 *
 * 1024 rather than 768: a tablet held upright is 768-834px wide, and a 256px
 * sidebar permanently parked in that leaves the back office working in about
 * 500px - narrower than the phone layout it is not using. Above this the
 * sidebar is docked and there is room for both.
 */
const MOBILE_BREAKPOINT = 1024;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
