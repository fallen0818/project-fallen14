-- ============================================
-- SUPABASE DATABASE SETUP SCRIPT
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- to set up the required tables and policies.
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: profiles
-- ============================================
-- Stores user profile information
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'analyst',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Table: projects
-- ============================================
-- Core project tracking table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  title TEXT NOT NULL,
  category TEXT,
  summary TEXT,
  initial_allocation NUMERIC(15,2),
  projected_roi NUMERIC(10,2),
  fiscal_commencement DATE,
  funding_sources TEXT[],
  implementing_department TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'flagged', 'completed')),
  user_id UUID REFERENCES auth.users(id)
);

-- ============================================
-- Table: unit_distribution
-- ============================================
-- Tracks personnel allocation per project
CREATE TABLE IF NOT EXISTS unit_distribution (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  engineering_heads INTEGER DEFAULT 0,
  design_ux_leads INTEGER DEFAULT 0,
  qa_count INTEGER DEFAULT 0,
  data_gov_count INTEGER DEFAULT 0
);

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on existing tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_distribution ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running the script)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Anyone can view projects" ON projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Anyone can view unit_distribution" ON unit_distribution;
DROP POLICY IF EXISTS "Users can insert unit_distribution" ON unit_distribution;
DROP POLICY IF EXISTS "Users can update unit_distribution" ON unit_distribution;

-- Profiles: Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Profiles: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Projects: Users can view all projects
CREATE POLICY "Anyone can view projects"
  ON projects FOR SELECT
  USING (true);

-- Projects: Users can insert their own projects
CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Projects: Users can update their own projects
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

-- Projects: Users can delete their own projects
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- Unit Distribution: Users can view all
CREATE POLICY "Anyone can view unit_distribution"
  ON unit_distribution FOR SELECT
  USING (true);

-- Unit Distribution: Users can insert
CREATE POLICY "Users can insert unit_distribution"
  ON unit_distribution FOR INSERT
  WITH CHECK (true);

-- Unit Distribution: Users can update
CREATE POLICY "Users can update unit_distribution"
  ON unit_distribution FOR UPDATE
  USING (true);

-- ============================================
-- Table: tasks
-- ============================================
-- Tasks associated with projects
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- Table: subtasks
-- ============================================
-- Subtasks associated with tasks
CREATE TABLE IF NOT EXISTS subtasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on new tables
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;
DROP POLICY IF EXISTS "Anyone can view subtasks" ON subtasks;
DROP POLICY IF EXISTS "Users can insert own subtasks" ON subtasks;
DROP POLICY IF EXISTS "Users can update subtasks" ON subtasks;
DROP POLICY IF EXISTS "Users can delete subtasks" ON subtasks;

-- Tasks: Users can view all tasks
CREATE POLICY "Anyone can view tasks"
  ON tasks FOR SELECT
  USING (true);

-- Tasks: Users can insert their own tasks
CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Tasks: Users can update tasks they created
CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = created_by);

-- Tasks: Users can delete tasks they created
CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  USING (auth.uid() = created_by);

-- Subtasks: Users can view all subtasks
CREATE POLICY "Anyone can view subtasks"
  ON subtasks FOR SELECT
  USING (true);

-- Subtasks: Users can insert subtasks
CREATE POLICY "Users can insert own subtasks"
  ON subtasks FOR INSERT
  WITH CHECK (true);

-- Subtasks: Users can update subtasks
CREATE POLICY "Users can update subtasks"
  ON subtasks FOR UPDATE
  USING (true);

-- Subtasks: Users can delete subtasks
CREATE POLICY "Users can delete subtasks"
  ON subtasks FOR DELETE
  USING (true);

-- ============================================
-- Enable Real-time for projects table
-- ============================================
-- In Supabase Dashboard -> Database -> Replication
-- Enable real-time for the "projects" table

-- ============================================
-- Trigger function for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS update_subtasks_updated_at ON subtasks;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Triggers for updated_at (tasks and subtasks)
-- ============================================

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subtasks_updated_at
  BEFORE UPDATE ON subtasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper Function: Calculate Task Progress
-- ============================================
-- Returns the completion percentage of a task based on its subtasks
CREATE OR REPLACE FUNCTION get_task_progress(task_id UUID)
RETURNS NUMERIC(5,2) AS $$
DECLARE
  total_subtasks INTEGER;
  completed_subtasks INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_subtasks FROM subtasks WHERE task_id = $1;
  SELECT COUNT(*) INTO completed_subtasks FROM subtasks WHERE task_id = $1 AND status = 'completed';
  
  IF total_subtasks = 0 THEN
    RETURN 0;
  END IF;
  
  RETURN (completed_subtasks::NUMERIC / total_subtasks::NUMERIC) * 100;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper Function: Calculate Project Task Progress
-- ============================================
-- Returns the overall task completion percentage for a project
CREATE OR REPLACE FUNCTION get_project_task_progress(project_id UUID)
RETURNS NUMERIC(5,2) AS $$
DECLARE
  total_tasks INTEGER;
  completed_tasks INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_tasks FROM tasks WHERE project_id = $1;
  SELECT COUNT(*) INTO completed_tasks FROM tasks WHERE project_id = $1 AND status = 'completed';
  
  IF total_tasks = 0 THEN
    RETURN 0;
  END IF;
  
  RETURN (completed_tasks::NUMERIC / total_tasks::NUMERIC) * 100;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Enable Real-time for tasks and subtasks tables
-- ============================================
-- In Supabase Dashboard -> Database -> Replication
-- Enable real-time for the "tasks" and "subtasks" tables

-- ============================================
-- Setup complete!
-- ============================================
