import { Employee } from '../../types';

export const INITIAL_EMPLOYEE: Employee = {
    id: "SZB-882910",
    name: "李明轩",
    title: "高级客户经理",
    department: "个人金融部",
    email: "limingxuan@suzhoubank.com",
    phone: "138-1234-5678",
    location: "苏州工业园区总行大厦",
    joinDate: "2018-03-15",
    bio: "拥有丰富的个人理财规划经验，致力于为客户提供最优质的金融服务方案。善于分析市场动态，为高净值客户定制资产配置策略。",
    avatarUrl: "https://picsum.photos/200/200"
};

export const MENU_ITEMS = [
    { name: '工作台', icon: 'LayoutDashboard' },
    { name: '个人档案', icon: 'User', active: true },
    { name: '薪资管理', icon: 'Banknote' },
    { name: '考勤记录', icon: 'Clock' },
    { name: '系统设置', icon: 'Settings' },
];
