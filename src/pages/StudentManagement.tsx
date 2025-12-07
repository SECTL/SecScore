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

const StudentManagement: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    class: ''
  });

  // 获取学生列表
  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const result = await invoke('get_students');
      setStudents(result as Student[]);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // 过滤学生列表
  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.class.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 处理表单输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 处理添加学生
  const handleAddStudent = async () => {
    if (!formData.name.trim() || !formData.class.trim()) return;
    
    try {
      await invoke('add_student', formData);
      fetchStudents();
      setFormData({ name: '', class: '' });
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to add student:', err);
    }
  };

  // 处理编辑学生
  const handleEditStudent = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      class: student.class
    });
    setShowAddModal(true);
  };

  // 处理更新学生
  const handleUpdateStudent = async () => {
    if (!editingStudent) return;
    if (!formData.name.trim() || !formData.class.trim()) return;
    
    try {
      await invoke('update_student', {
        id: editingStudent.id,
        ...formData
      });
      fetchStudents();
      setFormData({ name: '', class: '' });
      setEditingStudent(null);
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to update student:', err);
    }
  };

  // 处理删除学生
  const handleDeleteStudent = async (id: number) => {
    if (!window.confirm('确定要删除这个学生吗？此操作将同时删除该学生的所有积分记录。')) return;
    
    try {
      await invoke('delete_student', { id });
      fetchStudents();
    } catch (err) {
      console.error('Failed to delete student:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题和操作栏 */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">学生管理</h2>
        <div className="flex space-x-4">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索学生..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            onClick={() => {
              setEditingStudent(null);
              setFormData({ name: '', class: '' });
              setShowAddModal(true);
            }}
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            添加学生
          </button>
        </div>
      </div>

      {/* 学生列表 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {isLoading ? (
          <div className="loading py-8">
            <div className="loading-spinner"></div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="empty-state py-12">
            <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="empty-state-text">没有找到学生</p>
          </div>
        ) : (
          <table className="table w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">姓名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">班级</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">总积分</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{student.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{student.class}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-primary">{student.total_points}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{new Date(student.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditStudent(student)}
                        className="text-primary hover:text-primary/80 transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteStudent(student.id)}
                        className="text-danger hover:text-danger/80 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 添加/编辑学生模态框 */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingStudent ? '编辑学生' : '添加学生'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="form-label">姓名</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    className="form-input"
                    placeholder="请输入学生姓名"
                    value={formData.name}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <label htmlFor="class" className="form-label">班级</label>
                  <input
                    type="text"
                    id="class"
                    name="class"
                    className="form-input"
                    placeholder="请输入班级名称"
                    value={formData.class}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn-secondary"
              >
                取消
              </button>
              <button
                onClick={editingStudent ? handleUpdateStudent : handleAddStudent}
                className="btn btn-primary"
                disabled={!formData.name.trim() || !formData.class.trim()}
              >
                {editingStudent ? '保存修改' : '添加学生'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;