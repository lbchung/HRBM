'use client';

import '@ant-design/v5-patch-for-react-19';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getTheme } from '@bachmai/ui';
import { ApiError } from '@/lib/api';

dayjs.locale('vi');

const THEME_KEY = 'bm-theme';

interface ThemeMode {
  dark: boolean;
  toggle: () => void;
}
const ThemeModeContext = createContext<ThemeMode>({ dark: false, toggle: () => {} });
export const useThemeMode = () => useContext(ThemeModeContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );

  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      setDark(localStorage.getItem(THEME_KEY) === 'dark');
    } catch {
      /* storage bị chặn — dùng mặc định */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  const toggle = useCallback(() => {
    setDark((d) => {
      try {
        localStorage.setItem(THEME_KEY, d ? 'light' : 'dark');
      } catch {
        /* bỏ qua */
      }
      return !d;
    });
  }, []);

  return (
    <ThemeModeContext.Provider value={{ dark, toggle }}>
      <ConfigProvider theme={getTheme(dark)} locale={viVN}>
        <App>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </App>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
