export type EmployeeStatus = 'active' | 'on-leave' | 'deactivated';

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  manager: string;
  status: EmployeeStatus;
  startDate: string;
  applications: string[];
  roles: string[];
}

export interface Application {
  id: string;
  name: string;
  owner: string;
  /** Departments that normally hold this application. */
  standardFor: string[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
}

export const DEPARTMENTS = [
  { id: 'engineering', name: 'Engineering' },
  { id: 'finance', name: 'Finance' },
  { id: 'people', name: 'People Operations' },
  { id: 'sales', name: 'Sales' },
  { id: 'support', name: 'Customer Support' },
];

export const APPLICATIONS: Application[] = [
  { id: 'github', name: 'GitHub', owner: 'Engineering', standardFor: ['engineering'] },
  { id: 'jira', name: 'Jira', owner: 'Engineering', standardFor: ['engineering', 'support'] },
  { id: 'slack', name: 'Slack', owner: 'IT', standardFor: ['engineering', 'finance', 'people', 'sales', 'support'] },
  { id: 'salesforce', name: 'Salesforce', owner: 'Sales', standardFor: ['sales'] },
  { id: 'finance-portal', name: 'Finance Portal', owner: 'Finance', standardFor: ['finance'] },
  { id: 'aws', name: 'AWS', owner: 'Engineering', standardFor: ['engineering'] },
];

export const ROLES: Role[] = [
  { id: 'employee', name: 'Employee', description: 'Baseline access for all staff.' },
  { id: 'manager', name: 'Manager', description: 'Can view and approve direct reports.' },
  { id: 'admin', name: 'Administrator', description: 'Full administrative access to ACME systems.' },
  { id: 'auditor', name: 'Auditor', description: 'Read-only access to finance records.' },
];

const seed: Employee[] = [
  {
    id: 'E-482',
    name: 'Sarah Chen',
    email: 'sarah.chen@acme.test',
    department: 'engineering',
    manager: 'Miguel Torres',
    status: 'active',
    startDate: '2021-03-15',
    applications: ['github', 'jira', 'slack', 'aws'],
    roles: ['employee'],
  },
  {
    id: 'E-104',
    name: 'Miguel Torres',
    email: 'miguel.torres@acme.test',
    department: 'engineering',
    manager: 'Dana Whitfield',
    status: 'active',
    startDate: '2018-07-02',
    applications: ['github', 'jira', 'slack', 'aws'],
    roles: ['employee', 'manager'],
  },
  {
    id: 'E-733',
    name: 'Priya Raman',
    email: 'priya.raman@acme.test',
    department: 'finance',
    manager: 'Dana Whitfield',
    status: 'active',
    startDate: '2020-01-06',
    applications: ['slack', 'finance-portal'],
    roles: ['employee', 'auditor'],
  },
  {
    id: 'E-215',
    name: 'Dana Whitfield',
    email: 'dana.whitfield@acme.test',
    department: 'people',
    manager: '—',
    status: 'active',
    startDate: '2016-11-21',
    applications: ['slack'],
    roles: ['employee', 'manager', 'admin'],
  },
  {
    id: 'E-901',
    name: 'Tom Okafor',
    email: 'tom.okafor@acme.test',
    department: 'sales',
    manager: 'Dana Whitfield',
    status: 'on-leave',
    startDate: '2022-09-05',
    applications: ['slack', 'salesforce'],
    roles: ['employee'],
  },
  {
    id: 'E-556',
    name: 'Aisha Bello',
    email: 'aisha.bello@acme.test',
    department: 'support',
    manager: 'Tom Okafor',
    status: 'active',
    startDate: '2023-02-13',
    applications: ['slack', 'jira'],
    roles: ['employee'],
  },
];

/**
 * In-memory store. A legacy app would talk to a server; the point here is that
 * Reflex works against whatever the DOM shows, not against an API.
 */
export const store = {
  employees: seed.map((employee) => ({ ...employee })),
  nextId: 1000,
};

export const departmentName = (id: string): string =>
  DEPARTMENTS.find((department) => department.id === id)?.name ?? id;

export const applicationName = (id: string): string =>
  APPLICATIONS.find((application) => application.id === id)?.name ?? id;

export const roleName = (id: string): string => ROLES.find((role) => role.id === id)?.name ?? id;

export const statusLabel = (status: EmployeeStatus): string =>
  status === 'active' ? 'Active' : status === 'on-leave' ? 'On leave' : 'Deactivated';

export const findEmployee = (id: string): Employee | undefined =>
  store.employees.find((employee) => employee.id.toLowerCase() === id.toLowerCase());

export const searchEmployees = (query: string, department?: string): Employee[] => {
  const needle = query.trim().toLowerCase();
  return store.employees.filter((employee) => {
    const matchesQuery =
      !needle ||
      employee.name.toLowerCase().includes(needle) ||
      employee.email.toLowerCase().includes(needle) ||
      employee.id.toLowerCase().includes(needle);
    const matchesDepartment = !department || employee.department === department;
    return matchesQuery && matchesDepartment;
  });
};

export const createEmployee = (input: {
  fullName: string;
  email: string;
  department: string;
  manager: string;
  startDate: string;
}): Employee => {
  store.nextId += 1;
  const employee: Employee = {
    id: `E-${store.nextId}`,
    name: input.fullName,
    email: input.email,
    department: input.department,
    manager: input.manager || '—',
    status: 'active',
    startDate: input.startDate || new Date().toISOString().slice(0, 10),
    applications: ['slack'],
    roles: ['employee'],
  };
  store.employees.unshift(employee);
  return employee;
};
