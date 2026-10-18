import { theme, type ThemeConfig } from 'antd';

/** Nhận diện Bệnh viện Bạch Mai — lấy từ https://bachmai.gov.vn/ */
export const BRAND = {
  primary: '#008046',
  primaryDark: '#006236',
  accent: '#ffc52c',
  text: '#212529',
  textSecondary: '#545454',
  bgSubtle: '#f5f5f5',
  slogan: 'Trí – Đức – Chuyên – Tâm',
  name: 'Bệnh viện Bạch Mai',
  appName: 'Hệ thống Quản lý Nhân sự',
} as const;

export const FONT_BODY = "var(--font-roboto), 'Roboto', -apple-system, 'Segoe UI', Arial, sans-serif";
export const FONT_HEADING = "var(--font-noto-serif), 'Noto Serif', Georgia, serif";

export function getTheme(dark: boolean): ThemeConfig {
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    cssVar: true,
    hashed: false,
    token: {
      colorPrimary: BRAND.primary,
      colorInfo: BRAND.primary,
      colorLink: BRAND.primary,
      colorWarning: '#e6a700',
      fontFamily: FONT_BODY,
      fontSize: 14,
      borderRadius: 8,
      ...(dark ? {} : { colorBgLayout: BRAND.bgSubtle, colorText: BRAND.text }),
    },
    components: {
      Layout: {
        headerBg: dark ? '#141414' : '#ffffff',
        siderBg: dark ? '#141414' : '#ffffff',
        headerHeight: 56,
        headerPadding: '0 16px',
      },
      Menu: {
        itemSelectedBg: dark ? 'rgba(0,128,70,0.25)' : 'rgba(0,128,70,0.10)',
        itemSelectedColor: dark ? '#4cc38a' : BRAND.primary,
        itemBorderRadius: 6,
      },
      Table: {
        headerBg: dark ? '#1f1f1f' : '#f0f7f3',
        headerColor: dark ? undefined : BRAND.primaryDark,
      },
      Card: { borderRadiusLG: 10 },
    },
  };
}
