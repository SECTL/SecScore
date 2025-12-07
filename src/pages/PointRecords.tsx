import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface PointRecord {
  id: number;
  student_id: number;
  points: number;
  reason: string;
  timestamp: string;
  operator: string;
}

interface Student {
  id: number;
  name: string;
  class: string;
}

const PointRecords: React.FC = () => {
  const [records, setRecords] = useState<PointRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<number | ''>('');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');

  // 获取学生列表
  const fetchStudents = async () => {
    try {
      const result = await invoke('get_students');
      setStudents(result as Student[]);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    }
  };

  // 获取积分记录
  const fetchPointRecords = async () => {
    setIsLoading(true);
    try {
      const result = await invoke('get_point_records', { 
        studentId: selectedStudent || undefined 
      });
      setRecords(result as PointRecord[]);
    } catch (err) {
      console.error('Failed to fetch point records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始化数据
  useEffect(() => {
    fetchStudents();
    fetchPointRecords();
  }, []);

  // 当选择学生或日期范围变化时重新获取记录
  useEffect(() => {
    fetchPointRecords();
  }, [selectedStudent]);

  // 处理搜索
  const handleSearch = () => {
    fetchPointRecords();
  };

  // 重置筛选条件
  const handleReset = () => {
    setSelectedStudent('');
    setDateRange('all');
    fetchPointRecords();
  };

  // 根据日期范围筛选记录
  const filteredRecords = records.filter(record => {
    const recordDate = new Date(record.timestamp);
    const now = new Date();
    
    switch (dateRange) {
      case 'today':
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return recordDate >= today;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return recordDate >= weekAgo;
      case 'month':
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        return recordDate >= monthAgo;
      case 'all':
        return true;
    }
  });

  // 获取学生姓名
  const getStudentName = (studentId: number) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.name} - ${student.class}` : `学生ID: ${studentId}`;
  };

  return (
    <div className="space-y-6">
      {/* 页面标题和筛选栏 */}
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-4">积分记录</h2>
        
        <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 学生选择 */}
            <div>
              <label htmlFor="student" className="form-label">选择学生</label>
              <select
                id="student"
                className="form-input"
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value as any)}
              >
                <option value="">全部学生</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} - {student.class}
                  </option>
                ))}
              </select>
            </div>

            {/* 日期范围 */}
            <div>
              <label className="form-label">时间范围</label>
              <select
                className="form-input"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
              >
                <option value="all">全部时间</option>
                <option value="today">今日</option>
                <option value="week">本周</option>
                <option value="month">本月</option>
              </select>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-end space-x-2">
              <button
                onClick={handleSearch}
                className="btn btn-primary"
              >
                搜索
              </button>
              <button
                onClick={handleReset}
                className="btn btn-secondary"
              >
                重置
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 积分记录列表 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {isLoading ? (
          <div className="loading py-8">
            <div className="loading-spinner"></div>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="empty-state py-12">
            <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="empty-state-text">没有找到积分记录</p>
          </div>
        ) : (
          <table className="table w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">学生</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">积分变化</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作理由</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作员</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{getStudentName(record.student_id)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${record.points > 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                      {record.points > 0 ? '+' : ''}{record.points}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{record.reason}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{new Date(record.timestamp).toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{record.operator}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 统计信息 */}
      {filteredRecords.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">统计信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-primary/10 p-3 rounded-md">
              <p className="text-sm text-gray-600">总记录数</p>
              <p className="text-xl font-bold text-primary">{filteredRecords.length}</p>
            </div>
            <div className="bg-success/10 p-3 rounded-md">
              <p className="text-sm text-gray-600">总加分</p>
              <p className="text-xl font-bold text-success">
                +{filteredRecords.filter(r => r.points > 0).reduce((sum, r) => sum + r.points, 0)}
              </p>
            </div>
            <div className="bg-danger/10 p-3 rounded-md">
              <p className="text-sm text-gray-600">总扣分</p>
              <p className="text-xl font-bold text-danger">
                {filteredRecords.filter(r => r.points < 0).reduce((sum, r) => sum + r.points, 0)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PointRecords;