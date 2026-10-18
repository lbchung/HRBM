'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'bm-campus';

interface CampusFilter {
  /** undefined = tất cả cơ sở */
  campusId?: string;
  setCampusId: (id?: string) => void;
}

const Ctx = createContext<CampusFilter>({ setCampusId: () => {} });

/** Bộ chọn cơ sở toàn cục trên header — làm bộ lọc mặc định cho các danh sách. Ghi nhớ theo trình duyệt. */
export function CampusFilterProvider({ children }: { children: React.ReactNode }) {
  const [campusId, setState] = useState<string>();
  useEffect(() => {
    try {
      setState(localStorage.getItem(KEY) || undefined);
    } catch {
      /* storage bị chặn */
    }
  }, []);
  const setCampusId = (id?: string) => {
    setState(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
  };
  return <Ctx.Provider value={{ campusId, setCampusId }}>{children}</Ctx.Provider>;
}

export const useCampusFilter = () => useContext(Ctx);
