import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Student {
  id: number;
  name: string;
  class: string;
  total_points: number;
  created_at: string;
  updated_at: string;
}

interface RankingItem {
  rank: number;
  student: Student;
  today_change: number;
}

export const Ranking: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [sortBy, setSortBy] = useState<'rank' | 'points'>('rank');

  // 获取学生列表
  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const result = await invoke('get_students');
      const studentsList = result as Student[];
      setStudents(studentsList);
      calculateRanking(studentsList);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 计算排行榜
  const calculateRanking = (studentsList: Student[]) => {
    // 按总积分排序
    const sortedStudents = [...studentsList].sort((a, b) => b.total_points - a.total_points);
    
    // 计算排名
    const rankingList = sortedStudents.map((student, index) => ({
      rank: index + 1,
      student,
      today_change: 0 // 暂时设为0，实际需要查询今日积分变化
    }));
    
    setRanking(rankingList);
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // 当学生列表变化时重新计算排名
  useEffect(() => {
    calculateRanking(students);
  }, [students, sortBy]);

  // 当时间范围变化时，这里需要查询对应时间范围的积分变化
  const handleTimeRangeChange = (range: 'today' | 'week' | 'month' | 'all') => {
    setTimeRange(range);
    // 这里需要调用API获取对应时间范围的积分变化
    // 暂时只更新状态
  };

  // 查看学生详情
  const handleViewDetails = (studentId: number) => {
    // 跳转到学生详情页面或显示详情模态框
    console.log('View details for student:', studentId);
  };

  return (
    <div className="space-y-6">
      {/* 页面标题和筛选栏 */}
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-4">积分排行榜</h2>
        
        <div className="bg-white rounded-lg shadow-md p-4 flex flex-wrap justify-between items-center">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">时间范围:</span>
            <div className="flex space-x-2">
              {(['today', 'week', 'month', 'all'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => handleTimeRangeChange(range)}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${timeRange === range ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  {range === 'today' ? '今日' : range === 'week' ? '本周' : range === 'month' ? '本月' : '全部'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">排序方式:</span>
            <select
              className="form-input text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'rank' | 'points')}
            >
              <option value="rank">按排名</option>
              <option value="points">按积分</option>
            </select>
          </div>
        </div>
      </div>

      {/* 排行榜表格 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {isLoading ? (
          <div className="loading py-8">
            <div className="loading-spinner"></div>
          </div>
        ) : ranking.length === 0 ? (
          <div className="empty-state py-12">
            <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="empty-state-text">没有学生数据</p>
          </div>
        ) : (
          <table className="table w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">排名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">姓名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">班级</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">总积分</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">今日变化</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ranking.map((item) => (
                <tr key={item.student.id} className={item.rank <= 3 ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {item.rank <= 3 && (
                        <span className={`inline-flex items-center justify-center w-6 h-6 mr-2 rounded-full text-white font-bold text-xs ${item.rank === 1 ? 'bg-yellow-500' : item.rank === 2 ? 'bg-gray-400' : 'bg-amber-700'}`}>
                          {item.rank}
                        </span>
                      )}
                      <span className={item.rank > 3 ? 'font-medium' : ''}>{item.rank}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{item.student.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{item.student.class}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-primary">{item.student.total_points}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.today_change > 0 ? 'bg-success/10 text-success' : item.today_change < 0 ? 'bg-danger/10 text-danger' : 'bg-gray-100 text-gray-600'}`}>
                      {item.today_change > 0 ? '+' : ''}{item.today_change}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleViewDetails(item.student.id)}
                      className="text-primary hover:text-primary/80 transition-colors"
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};