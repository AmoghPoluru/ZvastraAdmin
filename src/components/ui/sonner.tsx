"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = (props: ToasterProps) => (
  <Sonner className="toaster group" position="top-right" {...props} />
);

export { Toaster };
