import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const Settings: React.FC = () => {
  const { theme, setTheme, customBackground, setCustomBackground } = useTheme();
  const [previewColor, setPreviewColor] = useState(customBackground);
  const [showPreview, setShowPreview] = useState(false);

  // 主题选项
  const themeOptions = [
    { value: 'light' as const, label: '浅色主题', description: '默认浅色主题，适合明亮环境' },
    { value: 'dark' as const, label: '深色主题', description: '深色主题，适合夜间使用' },
    { value: 'eye-protection' as const, label: '护眼绿', description: '护眼绿色主题，减少眼睛疲劳' }
  ];

  // 处理主题切换
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'eye-protection') => {
    setTheme(newTheme);
  };

  // 处理自定义背景颜色变化
  const handleBackgroundChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreviewColor(e.target.value);
  };

  // 应用自定义背景颜色
  const applyBackground = () => {
    setCustomBackground(previewColor);
    setShowPreview(false);
  };

  // 取消自定义背景颜色
  const cancelBackground = () => {
    setPreviewColor(customBackground);
    setShowPreview(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-4">设置</h2>
        <p className="text-gray-600">自定义应用外观和行为</p>
      </div>

      {/* 主题设置 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">主题设置</h3>
        
        <div className="space-y-4">
          {/* 预设主题 */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">预设主题</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {themeOptions.map((option) => (
                <div
                  key={option.value}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${theme === option.value ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50'}`}
                  onClick={() => handleThemeChange(option.value)}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center ${option.value === 'light' ? 'bg-gray-200' : option.value === 'dark' ? 'bg-gray-800 text-white' : 'bg-green-200'}`}>
                      {option.value === 'light' && (
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      )}
                      {option.value === 'dark' && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                      )}
                      {option.value === 'eye-protection' && (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900">{option.label}</h5>
                      <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 自定义背景 */}
          <div className="divider"></div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">自定义背景</h4>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <label htmlFor="customBackground" className="text-sm text-gray-600">背景颜色:</label>
                <input
                  type="color"
                  id="customBackground"
                  value={previewColor}
                  onChange={handleBackgroundChange}
                  className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <span className="text-sm font-mono">{previewColor}</span>
                {!showPreview ? (
                  <button
                    onClick={() => setShowPreview(true)}
                    className="btn btn-primary text-sm"
                  >
                    预览
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button
                      onClick={applyBackground}
                      className="btn btn-primary text-sm"
                    >
                      应用
                    </button>
                    <button
                      onClick={cancelBackground}
                      className="btn btn-secondary text-sm"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
              
              {showPreview && (
                <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-white">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">实时预览</h5>
                  <div 
                    className="w-full h-24 rounded-md border border-gray-300 flex items-center justify-center" 
                    style={{ backgroundColor: previewColor }}
                  >
                    <span className="text-gray-700">背景预览</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">数据管理</h3>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary">
              备份数据
            </button>
            <button className="btn btn-secondary">
              恢复数据
            </button>
            <button className="btn btn-secondary">
              导出CSV
            </button>
          </div>
          <p className="text-sm text-gray-600">
            定期备份数据可以防止数据丢失，建议每周至少备份一次。
          </p>
        </div>
      </div>

      {/* 关于 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">关于</h3>
        <div className="space-y-2">
          <p className="text-sm text-gray-600">教育积分系统 v1.0.0</p>
          <p className="text-sm text-gray-600">使用 Tauri + React + Rust 开发</p>
          <p className="text-sm text-gray-600">© 2025 教育积分系统</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;