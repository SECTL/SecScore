import { useState } from 'react';

// 定义界面类型
type PageType = 'points' | 'ranking' | 'settings';

// 主应用组件
function App() {
  const [activePage, setActivePage] = useState<PageType>('points');
  const [activeTab, setActiveTab] = useState<string>('appearance');
  
  return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f3f4f6',
        display: 'flex'
      }}>
        {/* 侧边栏 */}
        <aside style={{
          width: '220px',
          backgroundColor: '#3b82f6',
          color: 'white',
          padding: '2rem 0',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 标题 */}
          <div style={{
            padding: '0 1.5rem',
            marginBottom: '2rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <h1 style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem'
            }}>
              教育积分系统
            </h1>
            <p style={{
              fontSize: '0.75rem',
              opacity: 0.8
            }}>
              课堂积分管理
            </p>
          </div>
          
          {/* 导航菜单 */}
          <nav style={{
            flex: 1,
            padding: '0 1rem'
          }}>
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: 0
            }}>
              {/* 积分管理 */}
              <li style={{
                marginBottom: '0.5rem'
              }}>
                <button
                  onClick={() => setActivePage('points')}
                  style={{
                    width: '100%',
                    backgroundColor: activePage === 'points' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <span style={{ fontSize: '1.125rem' }}>📋</span>
                  <span>积分管理</span>
                </button>
              </li>
              
              {/* 排行榜 */}
              <li style={{
                marginBottom: '0.5rem'
              }}>
                <button
                  onClick={() => setActivePage('ranking')}
                  style={{
                    width: '100%',
                    backgroundColor: activePage === 'ranking' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <span style={{ fontSize: '1.125rem' }}>🏆</span>
                  <span>排行榜</span>
                </button>
              </li>
              
              {/* 设置 */}
              <li style={{
                marginBottom: '0.5rem'
              }}>
                <button
                  onClick={() => setActivePage('settings')}
                  style={{
                    width: '100%',
                    backgroundColor: activePage === 'settings' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <span style={{ fontSize: '1.125rem' }}>⚙️</span>
                  <span>设置</span>
                </button>
              </li>
            </ul>
          </nav>
          
          {/* 底部信息 */}
          <div style={{
            padding: '1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            fontSize: '0.75rem',
            opacity: 0.8
          }}>
            <p>版本 1.0.0</p>
            <p style={{ marginTop: '0.25rem' }}>© 2025 教育积分系统</p>
          </div>
        </aside>
        
        {/* 主内容区 */}
        <main style={{
          flex: 1,
          padding: '2rem',
          overflowY: 'auto'
        }}>
          {/* 积分管理界面 */}
          {activePage === 'points' && (
            <div>
              <header style={{
                marginBottom: '2rem'
              }}>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: '#1f2937',
                  marginBottom: '0.5rem'
                }}>
                  积分管理
                </h2>
                <p style={{ color: '#6b7280' }}>
                  给学生加分或减分，记录积分变动
                </p>
              </header>
              
              {/* 积分操作表单 */}
              <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                maxWidth: '800px'
              }}>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  marginBottom: '1.5rem',
                  color: '#374151'
                }}>
                  积分操作
                </h3>
                
                <form style={{
                  display: 'grid',
                  gap: '1.5rem',
                  gridTemplateColumns: '1fr 1fr',
                  alignItems: 'end'
                }}>
                  {/* 学生选择 */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      学生姓名
                    </label>
                    <select style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      backgroundColor: 'white'
                    }}>
                      <option value="">请选择学生</option>
                      <option value="1">张三</option>
                      <option value="2">李四</option>
                      <option value="3">王五</option>
                    </select>
                  </div>
                  
                  {/* 积分类型 */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      积分类型
                    </label>
                    <div style={{
                      display: 'flex',
                      gap: '1rem'
                    }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        transition: 'background-color 0.2s'
                      }}>
                        <input type="radio" name="pointType" value="add" style={{ cursor: 'pointer' }} />
                        <span style={{ color: '#10b981', fontWeight: '500' }}>加分</span>
                      </label>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        transition: 'background-color 0.2s'
                      }}>
                        <input type="radio" name="pointType" value="subtract" style={{ cursor: 'pointer' }} />
                        <span style={{ color: '#ef4444', fontWeight: '500' }}>减分</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* 分数输入 */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      分数
                    </label>
                    <input type="number" style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }} placeholder="请输入分数" />
                  </div>
                  
                  {/* 理由选择 */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      理由
                    </label>
                    <select style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      backgroundColor: 'white'
                    }}>
                      <option value="">请选择理由</option>
                      <option value="answer">回答问题</option>
                      <option value="homework">作业优秀</option>
                      <option value="behavior">课堂表现</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                  
                  {/* 提交按钮 */}
                  <div style={{
                    gridColumn: 'span 2'
                  }}>
                    <button type="submit" style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      transition: 'background-color 0.2s'
                    }}>
                      提交
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          
          {/* 排行榜界面 */}
          {activePage === 'ranking' && (
            <div>
              <header style={{
                marginBottom: '2rem'
              }}>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: '#1f2937',
                  marginBottom: '0.5rem'
                }}>
                  积分排行榜
                </h2>
                <p style={{ color: '#6b7280' }}>
                  查看学生积分排名和变动情况
                </p>
              </header>
              
              {/* 排行榜表格 */}
              <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse'
                }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#f9fafb',
                      borderBottom: '2px solid #e5e7eb'
                    }}>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        排名
                      </th>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        学生姓名
                      </th>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'right',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        总积分
                      </th>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        今日变动
                      </th>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 排行榜数据 */}
                    <tr style={{
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background-color 0.2s'
                    }}>
                      <td style={{
                        padding: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        color: '#f59e0b'
                      }}>
                        1
                      </td>
                      <td style={{
                        padding: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#374151'
                      }}>
                        张三
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'right',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        color: '#1f2937'
                      }}>
                        150
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#10b981'
                      }}>
                        +10
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'center'
                      }}>
                        <button style={{
                          backgroundColor: 'transparent',
                          color: '#3b82f6',
                          border: '1px solid #3b82f6',
                          padding: '0.375rem 0.75rem',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          transition: 'all 0.2s'
                        }}>
                          查看记录
                        </button>
                      </td>
                    </tr>
                    
                    <tr style={{
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background-color 0.2s'
                    }}>
                      <td style={{
                        padding: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        color: '#6b7280'
                      }}>
                        2
                      </td>
                      <td style={{
                        padding: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#374151'
                      }}>
                        李四
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'right',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        color: '#1f2937'
                      }}>
                        135
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#6b7280'
                      }}>
                        0
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'center'
                      }}>
                        <button style={{
                          backgroundColor: 'transparent',
                          color: '#3b82f6',
                          border: '1px solid #3b82f6',
                          padding: '0.375rem 0.75rem',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          transition: 'all 0.2s'
                        }}>
                          查看记录
                        </button>
                      </td>
                    </tr>
                    
                    <tr style={{
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background-color 0.2s'
                    }}>
                      <td style={{
                        padding: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        color: '#d97706'
                      }}>
                        3
                      </td>
                      <td style={{
                        padding: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#374151'
                      }}>
                        王五
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'right',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        color: '#1f2937'
                      }}>
                        120
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#ef4444'
                      }}>
                        -5
                      </td>
                      <td style={{
                        padding: '1rem',
                        textAlign: 'center'
                      }}>
                        <button style={{
                          backgroundColor: 'transparent',
                          color: '#3b82f6',
                          border: '1px solid #3b82f6',
                          padding: '0.375rem 0.75rem',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          transition: 'all 0.2s'
                        }}>
                          查看记录
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* 设置界面 */}
          {activePage === 'settings' && (
            <div>
              <header style={{
                marginBottom: '2rem'
              }}>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: '#1f2937',
                  marginBottom: '0.5rem'
                }}>
                  设置
                </h2>
                <p style={{ color: '#6b7280' }}>
                  配置系统参数和密码
                </p>
              </header>
              
              {/* 设置内容 */}
              <div style={{
                backgroundColor: 'white',
                padding: '0',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                maxWidth: '800px',
                overflow: 'hidden'
              }}>
                {/* 标签页导航 */}
                <div style={{
                  display: 'flex',
                  borderBottom: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb'
                }}>
                  <button 
                    onClick={() => setActiveTab('appearance')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: activeTab === 'appearance' ? 'white' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'appearance' ? '2px solid #3b82f6' : 'none',
                      color: activeTab === 'appearance' ? '#3b82f6' : '#6b7280',
                      fontWeight: activeTab === 'appearance' ? '500' : 'normal',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    外观
                  </button>
                  <button 
                    onClick={() => setActiveTab('security')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: activeTab === 'security' ? 'white' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'security' ? '2px solid #3b82f6' : 'none',
                      color: activeTab === 'security' ? '#3b82f6' : '#6b7280',
                      fontWeight: activeTab === 'security' ? '500' : 'normal',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    安全
                  </button>
                  <button 
                    onClick={() => setActiveTab('data')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: activeTab === 'data' ? 'white' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'data' ? '2px solid #3b82f6' : 'none',
                      color: activeTab === 'data' ? '#3b82f6' : '#6b7280',
                      fontWeight: activeTab === 'data' ? '500' : 'normal',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    数据管理
                  </button>
                  <button 
                    onClick={() => setActiveTab('about')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: activeTab === 'about' ? 'white' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'about' ? '2px solid #3b82f6' : 'none',
                      color: activeTab === 'about' ? '#3b82f6' : '#6b7280',
                      fontWeight: activeTab === 'about' ? '500' : 'normal',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    关于
                  </button>
                </div>
                
                {/* 标签页内容 */}
                <div style={{
                  padding: '2rem'
                }}>
                  {/* 外观标签页 */}
                  {activeTab === 'appearance' && (
                    <div>
                      <h3 style={{
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        marginBottom: '1.5rem',
                        color: '#374151'
                      }}>
                        外观设置
                      </h3>
                      
                      <form style={{
                        display: 'grid',
                        gap: '1.5rem'
                      }}>
                        {/* 主题选择 */}
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '0.5rem'
                          }}>
                            主题选择
                          </label>
                          <div style={{
                            display: 'flex',
                            gap: '1rem'
                          }}>
                            <label style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              cursor: 'pointer',
                              padding: '0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              transition: 'all 0.2s',
                              backgroundColor: 'white'
                            }}>
                              <input type="radio" name="theme" value="light" style={{ cursor: 'pointer' }} defaultChecked />
                              <span style={{ fontSize: '0.875rem', color: '#374151' }}>浅色主题</span>
                            </label>
                            <label style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              cursor: 'pointer',
                              padding: '0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              transition: 'all 0.2s',
                              backgroundColor: 'white'
                            }}>
                              <input type="radio" name="theme" value="dark" style={{ cursor: 'pointer' }} />
                              <span style={{ fontSize: '0.875rem', color: '#374151' }}>深色主题</span>
                            </label>
                            <label style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              cursor: 'pointer',
                              padding: '0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              transition: 'all 0.2s',
                              backgroundColor: 'white'
                            }}>
                              <input type="radio" name="theme" value="eye" style={{ cursor: 'pointer' }} />
                              <span style={{ fontSize: '0.875rem', color: '#374151' }}>护眼主题</span>
                            </label>
                          </div>
                        </div>
                        
                        {/* 背景设置 */}
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '0.5rem'
                          }}>
                            背景颜色
                          </label>
                          <input 
                            type="color" 
                            defaultValue="#ffffff" 
                            style={{
                              width: '100%',
                              height: '40px',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              cursor: 'pointer'
                            }}
                          />
                        </div>
                        
                        {/* 提交按钮 */}
                        <div>
                          <button type="submit" style={{
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            transition: 'background-color 0.2s'
                          }}>
                            保存设置
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                  
                  {/* 安全标签页 */}
                  {activeTab === 'security' && (
                    <div>
                      <h3 style={{
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        marginBottom: '1.5rem',
                        color: '#374151'
                      }}>
                        安全设置
                      </h3>
                      
                      <form style={{
                        display: 'grid',
                        gap: '1.5rem'
                      }}>
                        {/* 密码设置 */}
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '0.5rem'
                          }}>
                            设置密码
                          </label>
                          <input 
                            type="password" 
                            placeholder="请输入6位数字密码" 
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              fontSize: '0.875rem'
                            }} 
                            maxLength={6}
                          />
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            该密码只在修改积分时发挥保护作用
                          </p>
                        </div>
                        
                        {/* 确认密码 */}
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '0.5rem'
                          }}>
                            确认密码
                          </label>
                          <input 
                            type="password" 
                            placeholder="请再次输入密码" 
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              fontSize: '0.875rem'
                            }} 
                            maxLength={6}
                          />
                        </div>
                        
                        {/* 提交按钮 */}
                        <div>
                          <button type="submit" style={{
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            transition: 'background-color 0.2s'
                          }}>
                            保存设置
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                  
                  {/* 数据管理标签页 */}
                  {activeTab === 'data' && (
                    <div>
                      <h3 style={{
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        marginBottom: '1.5rem',
                        color: '#374151'
                      }}>
                        数据管理
                      </h3>
                      
                      <div style={{
                        display: 'grid',
                        gap: '2rem'
                      }}>
                        {/* 数据导入 */}
                        <div>
                          <h4 style={{
                            fontSize: '1rem',
                            fontWeight: '500',
                            marginBottom: '1rem',
                            color: '#374151'
                          }}>
                            数据导入
                          </h4>
                          <div style={{
                            border: '2px dashed #d1d5db',
                            borderRadius: '0.5rem',
                            padding: '2rem',
                            textAlign: 'center'
                          }}>
                            <input 
                              type="file" 
                              accept=".csv,.json" 
                              style={{
                                display: 'none'
                              }} 
                              id="import-file"
                            />
                            <label htmlFor="import-file" style={{
                              display: 'inline-block',
                              padding: '0.75rem 1.5rem',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              transition: 'background-color 0.2s'
                            }}>
                              选择文件导入
                            </label>
                            <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                              支持 CSV、JSON 格式文件
                            </p>
                          </div>
                        </div>
                        
                        {/* 数据导出 */}
                        <div>
                          <h4 style={{
                            fontSize: '1rem',
                            fontWeight: '500',
                            marginBottom: '1rem',
                            color: '#374151'
                          }}>
                            数据导出
                          </h4>
                          <div style={{
                            display: 'flex',
                            gap: '1rem'
                          }}>
                            <button style={{
                              padding: '0.75rem 1.5rem',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              transition: 'background-color 0.2s'
                            }}>
                              导出为 CSV
                            </button>
                            <button style={{
                              padding: '0.75rem 1.5rem',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              transition: 'background-color 0.2s'
                            }}>
                              导出为 JSON
                            </button>
                          </div>
                        </div>
                        
                        {/* 数据备份与恢复 */}
                        <div>
                          <h4 style={{
                            fontSize: '1rem',
                            fontWeight: '500',
                            marginBottom: '1rem',
                            color: '#374151'
                          }}>
                            备份与恢复
                          </h4>
                          <div style={{
                            display: 'flex',
                            gap: '1rem'
                          }}>
                            <button style={{
                              padding: '0.75rem 1.5rem',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              transition: 'background-color 0.2s'
                            }}>
                              创建备份
                            </button>
                            <button style={{
                              padding: '0.75rem 1.5rem',
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              transition: 'background-color 0.2s'
                            }}>
                              恢复数据
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 关于标签页 */}
                  {activeTab === 'about' && (
                    <div>
                      <h3 style={{
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        marginBottom: '1.5rem',
                        color: '#374151'
                      }}>
                        关于软件
                      </h3>
                      
                      <div style={{
                        display: 'grid',
                        gap: '1.5rem'
                      }}>
                        <div>
                          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                            版本信息
                          </p>
                          <p style={{ fontSize: '1rem', fontWeight: '500', color: '#374151' }}>
                            教育积分系统 v1.0.0
                          </p>
                        </div>
                        
                        <div>
                          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                            开发者
                          </p>
                          <p style={{ fontSize: '0.875rem', color: '#374151' }}>
                            SecScore Team
                          </p>
                        </div>
                        
                        <div>
                          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                            版权信息
                          </p>
                          <p style={{ fontSize: '0.875rem', color: '#374151' }}>
                            © 2025 教育积分系统. 保留所有权利.
                          </p>
                        </div>
                        
                        <div style={{
                          paddingTop: '1.5rem',
                          borderTop: '1px solid #e5e7eb'
                        }}>
                          <button style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: 'transparent',
                            color: '#3b82f6',
                            border: '1px solid #3b82f6',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                          }}>
                            检查更新
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
}

export default App;
