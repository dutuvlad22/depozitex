import {
  LayoutDashboard,
  PackagePlus,
  Boxes,
  ClipboardList,
  Truck,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Panou", icon: LayoutDashboard },
  { href: "/receptie", label: "Receptie", icon: PackagePlus },
  { href: "/stoc", label: "Stoc", icon: Boxes },
  { href: "/comenzi", label: "Comenzi", icon: ClipboardList },
  { href: "/expediere", label: "Expediere", icon: Truck },
  { href: "/retururi", label: "Retururi", icon: RotateCcw },
];
