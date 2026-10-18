import { create } from "zustand";

export type VendorTab = "deliveries" | "inventory" | "invoices" | "support";
export const useVendorTab = create<{ tab: VendorTab; set: (t: VendorTab) => void }>((set) => ({ tab: "deliveries", set: (tab) => set({ tab }) }));
