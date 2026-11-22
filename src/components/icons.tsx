import type { ReactNode } from "react";

const I = ({ d, size = 20 }: { d: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
export const Photo = () => <I d={<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></>} />;
export const Album = () => <I d={<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v8l3-2 3 2V4" /></>} />;
export const People = () => <I d={<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3 3 0 0 1 0 6M18 14c2 .6 3 2.4 3 6" /></>} />;
export const Star = ({ filled }: { filled?: boolean }) => <I d={<path fill={filled ? "currentColor" : "none"} d="m12 3 2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8L6.7 19.6l1-6L3.3 9.4l6-.9z" />} />;
export const Trash = () => <I d={<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>} />;
export const Shield = () => <I d={<path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z" />} />;
export const Search = () => <I d={<><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></>} />;
export const Close = () => <I d={<path d="M6 6l12 12M18 6 6 18" />} />;
export const Upload = () => <I d={<><path d="M12 16V5M7 9l5-5 5 5" /><path d="M4 16v3h16v-3" /></>} />;
export const Download = () => <I d={<><path d="M12 4v11M7 11l5 5 5-5" /><path d="M4 19h16" /></>} />;
export const Moon = () => <I d={<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />} />;
export const Info = () => <I d={<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.1" /></>} />;
export const Chevron = ({ dir = "down" }: { dir?: "down" | "up" | "left" | "right" }) => (
  <I d={<path d={{ down: "m6 9 6 6 6-6", up: "m6 15 6-6 6 6", left: "m15 6-6 6 6 6", right: "m9 6 6 6-6 6" }[dir]} />} />
);
export const Play = () => <I size={14} d={<path fill="currentColor" d="M8 5v14l11-7z" />} />;
export const Plus = () => <I d={<path d="M12 5v14M5 12h14" />} />;
export const Zoom = () => <I d={<><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4M11 8v6M8 11h6" /></>} />;
export const Check = () => <I size={14} d={<path d="m5 12 5 5 9-10" />} />;
