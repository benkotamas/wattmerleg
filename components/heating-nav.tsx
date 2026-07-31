"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items=[
  {href:"/futes",label:"Fűtésoptimalizálás"},
  {href:"/futes/elemzes",label:"Historikus elemzés"},
  {href:"/beallitasok/futes",label:"Rendszerbeállítások"},
];

export function HeatingNav(){const pathname=usePathname();return <nav className="subnav" aria-label="Fűtési modul">{items.map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?"page":undefined}>{item.label}</Link>)}</nav>}
