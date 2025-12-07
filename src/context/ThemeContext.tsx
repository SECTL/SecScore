import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

// 主题类型定义
type ThemeType = 'light' | 'dark' | 'eye-protection';

// 主题上下文类型定义
interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  customBackground: string;
  setCustomBackground: (color: string) => void;
  applyTheme: () => void;
}

// 创建主题上下文
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 主题提供器组件
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // 从本地存储获取主题设置
  const getInitialTheme = (): ThemeType => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme as ThemeType) || 'light';
  };

  const getInitialBackground = (): string => {
    const savedBackground = localStorage.getItem('customBackground');
    return savedBackground || '#f9fafb';
  };

  // 主题状态
  const [theme, setTheme] = useState<ThemeType>(getInitialTheme);
  const [customBackground, setCustomBackground] = useState<string>(getInitialBackground);

  // 应用主题
  const applyTheme = () => {
    // 移除所有主题类
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-eye-protection');
    // 添加当前主题类
    document.documentElement.classList.add(`theme-${theme}`);
    // 设置自定义背景
    document.documentElement.style.setProperty('--custom-background', customBackground);
  };

  // 当主题或自定义背景变化时，更新本地存储和应用主题
  useEffect(() => {
    localStorage.setItem('theme', theme);
    applyTheme();
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('customBackground', customBackground);
    document.documentElement.style.setProperty('--custom-background', customBackground);
  }, [customBackground]);

  // 初始化应用主题
  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, customBackground, setCustomBackground, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// 自定义钩子，用于使用主题上下文
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};