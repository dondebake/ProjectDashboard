import os
from datetime import datetime, timedelta, date
import json
import csv
import io
from flask import Flask, render_template, request, jsonify, Response
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from sqlalchemy import func, extract
from dateutil.relativedelta import relativedelta
from utils.date_utils import (
    add_working_days,
    subtract_working_days,
    count_working_days,
    is_working_day,
    get_next_working_day,
    calculate_end_date_from_hours,
    get_holidays_in_range
)

# Initialize Flask app
app = Flask(__name__)

# Configuration
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'dashboard.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Association tables for many-to-many relationships
project_team_association = db.Table('project_team_association',
    db.Column('project_id', db.Integer, db.ForeignKey('project.id'), primary_key=True),
    db.Column('team_member_id', db.Integer, db.ForeignKey('team_member.id'), primary_key=True)
)

task_assignment_association = db.Table('task_assignment_association',
    db.Column('task_id', db.Integer, db.ForeignKey('task.id'), primary_key=True),
    db.Column('team_member_id', db.Integer, db.ForeignKey('team_member.id'), primary_key=True)
)

# Models
class Role(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)

    def __repr__(self):
        return f'<Role {self.name}>'

DEFAULT_ROLES = [
    'Project Manager', 'Developer', 'Designer', 'QA Engineer',
    'DevOps Engineer', 'Business Analyst', 'Architect', 'Consultant',
]

class TeamMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    role = db.Column(db.String(50), nullable=False)
    hourly_rate = db.Column(db.Float, default=0.0)
    availability_hours_per_week = db.Column(db.Float, default=40.0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    projects = db.relationship('Project', secondary=project_team_association, back_populates='team_members')
    tasks = db.relationship('Task', back_populates='assignee')
    task_assignments = db.relationship('TaskAssignment', back_populates='team_member')
    project_availability = db.relationship('ProjectAvailability', back_populates='team_member')
    
    def __repr__(self):
        return f'<TeamMember {self.name}>'

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    client = db.Column(db.String(100), nullable=False)  # opdrachtgever
    project_manager = db.Column(db.String(100))
    status = db.Column(db.String(20), nullable=False, default='Active')  # Active, Completed, On Hold, Cancelled
    priority = db.Column(db.String(10), nullable=False, default='Medium')  # High, Medium, Low
    budget = db.Column(db.Float, default=0.0)
    spent = db.Column(db.Float, default=0.0)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    tasks = db.relationship('Task', back_populates='project', lazy=True, cascade='all, delete-orphan')
    task_groups = db.relationship('TaskGroup', back_populates='project', cascade='all, delete-orphan')
    team_members = db.relationship('TeamMember', secondary=project_team_association, lazy='subquery',
                                 back_populates='projects')
    availability_assignments = db.relationship('ProjectAvailability', back_populates='project', cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<Project {self.name}>'
    
    @property
    def budget_utilization(self):
        return (self.spent / self.budget * 100) if self.budget > 0 else 0
    
    @property
    def completion_percentage(self):
        if not self.tasks:
            return 0
        return sum(t.progress or 0 for t in self.tasks) / len(self.tasks)

class TaskDependency(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    predecessor_task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    successor_task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    dependency_type = db.Column(db.String(20), nullable=False, default='finish_to_start')
    # finish_to_start, start_to_start, finish_to_finish, start_to_finish
    lag_days = db.Column(db.Integer, default=0)  # delay in working days
    maintain_lag_only = db.Column(db.Boolean, default=True)  # True = only cascade when lag violated; False = always cascade (tight coupling)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    predecessor = db.relationship('Task', foreign_keys=[predecessor_task_id], back_populates='predecessors')
    successor = db.relationship('Task', foreign_keys=[successor_task_id], back_populates='dependencies')
    
    def __repr__(self):
        return f'<TaskDependency {self.predecessor_task_id} -> {self.successor_task_id}>'

class TaskAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    team_member_id = db.Column(db.Integer, db.ForeignKey('team_member.id'), nullable=False)
    allocated_hours = db.Column(db.Float, nullable=False)
    hours_per_week = db.Column(db.Float, nullable=False)
    weeks_allocated = db.Column(db.Float, nullable=False)
    actual_hours = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    task = db.relationship('Task', back_populates='assignments')
    team_member = db.relationship('TeamMember', back_populates='task_assignments')
    
    def __repr__(self):
        return f'<TaskAssignment {self.team_member.name} -> {self.task.title}>'

class ProjectAvailability(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    team_member_id = db.Column(db.Integer, db.ForeignKey('team_member.id'), nullable=False)
    hours_per_week = db.Column(db.Float, nullable=False, default=0.0)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project = db.relationship('Project', back_populates='availability_assignments')
    team_member = db.relationship('TeamMember', back_populates='project_availability')
    
    def __repr__(self):
        return f'<ProjectAvailability {self.team_member.name} -> {self.project.name}: {self.hours_per_week}h/week>'

class TaskGroup(db.Model):
    """Task groups for organizing activities hierarchically with color coding"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    parent_group_id = db.Column(db.Integer, db.ForeignKey('task_group.id'))  # For subgroups
    color = db.Column(db.String(7), default='#667eea')  # Hex color code
    is_expanded = db.Column(db.Boolean, default=True)  # Expand/collapse state
    sort_order = db.Column(db.Integer, default=0)  # For ordering groups
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = db.relationship('Project', back_populates='task_groups')
    parent_group = db.relationship('TaskGroup', remote_side=[id], back_populates='subgroups')
    subgroups = db.relationship('TaskGroup', back_populates='parent_group')
    tasks = db.relationship('Task', back_populates='group', lazy=True)
    
    def __repr__(self):
        return f'<TaskGroup {self.name}>'

    @property
    def task_count(self):
        return len(self.tasks)

    @property
    def all_task_count(self):
        """Count all tasks in this group and subgroups"""
        count = len(self.tasks)
        for subgroup in self.subgroups:
            count += subgroup.task_count
        return count

    @property
    def completion_percentage(self):
        """Calculate completion percentage based on all tasks in group and subgroups"""
        if self.all_task_count == 0:
            return 0
        completed_tasks = len([task for task in self.tasks if task.status == 'Completed'])
        for subgroup in self.subgroups:
            completed_tasks += subgroup.completion_percentage * subgroup.task_count / 100
        return min((completed_tasks / self.all_task_count) * 100, 100)

    @property
    def earliest_start(self):
        """Get the earliest start date of all tasks in the group and subgroups"""
        min_date = None
        for task in self.tasks:
            if not min_date or (task.start_date and task.start_date < min_date):
                min_date = task.start_date
        for subgroup in self.subgroups:
            subgroup_date = subgroup.earliest_start
            if subgroup_date and (not min_date or subgroup_date < min_date):
                min_date = subgroup_date
        return min_date

    @property
    def latest_end(self):
        """Get the latest end date of all tasks in the group and subgroups"""
        max_date = None
        for task in self.tasks:
            if not max_date or (task.end_date and task.end_date > max_date):
                max_date = task.end_date
        for subgroup in self.subgroups:
            subgroup_date = subgroup.latest_end
            if subgroup_date and (not max_date or subgroup_date > max_date):
                max_date = subgroup_date
        return max_date

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('task_group.id'))  # For grouping tasks
    assigned_to = db.Column(db.Integer, db.ForeignKey('team_member.id'))  # Single assignee
    status = db.Column(db.String(20), nullable=False, default='Pending')  # Pending, In Progress, Completed, On Hold
    priority = db.Column(db.String(10), nullable=False, default='Medium')  # High, Medium, Low
    estimated_hours = db.Column(db.Float, default=0.0)
    actual_hours = db.Column(db.Float, default=0.0)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    due_date = db.Column(db.Date)  # Deadline date
    duration_working_days = db.Column(db.Integer)  # Calculated working days
    sort_order = db.Column(db.Integer, default=0)  # For ordering tasks in UI
    fixed_start = db.Column(db.Boolean, default=False)  # Milestone: fixed start date
    fixed_end = db.Column(db.Boolean, default=False)  # Milestone: fixed end date
    maintain_lag_only = db.Column(db.Boolean, default=True)  # Cascade behavior: True = only when lag violated, False = always cascade
    progress = db.Column(db.Integer, default=0)  # User-set % ready (0-100), independent of hours
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = db.relationship('Project', back_populates='tasks')
    group = db.relationship('TaskGroup', back_populates='tasks')
    assignee = db.relationship('TeamMember', back_populates='tasks')
    assignments = db.relationship('TaskAssignment', back_populates='task', cascade='all, delete-orphan')
    dependencies = db.relationship('TaskDependency', foreign_keys='TaskDependency.successor_task_id', back_populates='successor')
    predecessors = db.relationship('TaskDependency', foreign_keys='TaskDependency.predecessor_task_id', back_populates='predecessor')
    
    def __repr__(self):
        return f'<Task {self.title}>'

    @property
    def completion_percentage(self):
        return self.progress or 0

# Utility helpers
def _calculate_duration_days(task: 'Task') -> int:
    """Return a positive duration in working days for the given task."""
    if task.duration_working_days and task.duration_working_days > 0:
        return task.duration_working_days
    if task.start_date and task.end_date:
        # Count actual working days between start and end dates
        working_days = count_working_days(task.start_date, task.end_date, include_saturday=False)
        return working_days if working_days > 0 else 1
    return 1

def _enforce_dependency_chain(task: 'Task', visited=None):
    """Ensure task (and its dependents) satisfy all dependency constraints.

    Relationship naming on Task (counterintuitive, do not change):
      task.dependencies  = TaskDependency rows where successor_task_id == task.id
                           (INCOMING edges; dep.predecessor is the upstream task)
      task.predecessors  = TaskDependency rows where predecessor_task_id == task.id
                           (OUTGOING edges; dep.successor is the downstream task)
    """
    if visited is None:
        visited = set()
    if not task or task.id in visited:
        return []
    visited.add(task.id)

    duration_days = _calculate_duration_days(task)
    start_date = task.start_date
    end_date = task.end_date

    if start_date and not end_date:
        end_date = add_working_days(start_date, duration_days - 1)
    if end_date and not start_date:
        start_date = subtract_working_days(end_date, duration_days - 1)

    start_constraints = []
    end_constraints = []

    # task.dependencies = incoming deps; dep.predecessor = upstream task
    for dep in task.dependencies:
        pred = dep.predecessor
        if not pred:
            continue
        lag = dep.lag_days or 0

        if dep.dependency_type == 'finish_to_start' and pred.end_date:
            # Successor must start the next working day after predecessor ends + lag.
            # add_working_days(date, 0) returns the date itself, so use lag+1 to get
            # "strictly after" semantics for FS.
            constraint_date = add_working_days(pred.end_date, lag + 1)
            if not is_working_day(constraint_date):
                constraint_date = get_next_working_day(constraint_date)
            start_constraints.append(constraint_date)
        elif dep.dependency_type == 'start_to_start' and pred.start_date:
            # Successor starts no earlier than predecessor start + lag working days.
            constraint_date = add_working_days(pred.start_date, lag)
            if not is_working_day(constraint_date):
                constraint_date = get_next_working_day(constraint_date)
            start_constraints.append(constraint_date)
        elif dep.dependency_type == 'finish_to_finish' and pred.end_date:
            # Successor ends no earlier than predecessor end + lag working days.
            constraint_date = add_working_days(pred.end_date, lag)
            end_constraints.append(constraint_date)
        elif dep.dependency_type == 'start_to_finish' and pred.start_date:
            # Successor ends no earlier than predecessor start + lag working days.
            constraint_date = add_working_days(pred.start_date, lag)
            end_constraints.append(constraint_date)

    updated = False

    # --- Apply start constraints (FS / SS) ---
    if start_constraints and not task.fixed_start:
        required_start = max(start_constraints)
        if not is_working_day(required_start):
            required_start = get_next_working_day(required_start)
        if not start_date or start_date < required_start:
            start_date = required_start
            end_date = add_working_days(start_date, duration_days - 1)
            updated = True
    elif start_date and (not end_date or end_date < start_date):
        end_date = add_working_days(start_date, duration_days - 1)
        updated = True

    # --- Apply end constraints (FF / SF) ---
    if end_constraints and not task.fixed_end:
        required_end = max(end_constraints)
        if not end_date or end_date < required_end:
            end_date = required_end
            # Shift start backward to preserve duration, unless start is fixed
            if not task.fixed_start:
                new_start = subtract_working_days(end_date, duration_days - 1)
                # Only move start forward, never behind an existing start constraint
                if not start_date or new_start > start_date:
                    start_date = new_start
            updated = True

    # Final sanity: end must be >= start
    if start_date and end_date and end_date < start_date:
        if not task.fixed_end:
            end_date = add_working_days(start_date, duration_days - 1)
        else:
            start_date = subtract_working_days(end_date, duration_days - 1)
        updated = True

    if start_date:
        task.start_date = start_date
    if end_date:
        task.end_date = end_date

    # Recalculate stored duration
    new_duration = count_working_days(task.start_date, task.end_date) if task.start_date and task.end_date else duration_days
    if new_duration != task.duration_working_days:
        task.duration_working_days = new_duration
        updated = True

    if updated:
        task.updated_at = datetime.utcnow()

    updates = [{
        'id': task.id,
        'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
        'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
        'duration_working_days': task.duration_working_days
    }] if updated else []

    # Cascade to downstream tasks: task.predecessors = outgoing edges
    for dep in task.predecessors:
        if dep.successor:
            updates.extend(_enforce_dependency_chain(dep.successor, visited))

    return updates

# Routes
@app.route('/')
def dashboard():
    """Main dashboard page"""
    return render_template('dashboard.html')

@app.route('/api/kpis')
def get_kpis():
    """Get KPI data for dashboard tiles"""
    total_projects = Project.query.count()
    active_projects = Project.query.filter_by(status='Active').count()
    completed_projects = Project.query.filter_by(status='Completed').count()
    
    # Calculate total budget and spending
    budget_data = db.session.query(
        func.sum(Project.budget).label('total_budget'),
        func.sum(Project.spent).label('total_spent')
    ).first()
    
    total_budget = budget_data.total_budget or 0
    total_spent = budget_data.total_spent or 0
    budget_utilization = (total_spent / total_budget * 100) if total_budget > 0 else 0
    
    # Calculate overdue tasks
    today = datetime.now().date()
    overdue_tasks = Task.query.filter(
        Task.due_date < today,
        Task.status != 'Completed'
    ).count()
    
    return jsonify({
        'total_projects': total_projects,
        'active_projects': active_projects,
        'completed_projects': completed_projects,
        'total_budget': total_budget,
        'total_spent': total_spent,
        'budget_utilization': round(budget_utilization, 1),
        'overdue_tasks': overdue_tasks
    })

@app.route('/api/projects')
def get_projects():
    """Get projects data with optional filtering"""
    status_filter = request.args.get('status')
    priority_filter = request.args.get('priority')
    
    query = Project.query
    
    if status_filter and status_filter != 'All':
        query = query.filter_by(status=status_filter)
    
    if priority_filter and priority_filter != 'All':
        query = query.filter_by(priority=priority_filter)
    
    projects = query.all()
    
    projects_data = []
    for project in projects:
        estimated_hours = sum(t.estimated_hours or 0 for t in project.tasks)
        actual_hours    = sum(t.actual_hours    or 0 for t in project.tasks)
        projects_data.append({
            'id': project.id,
            'name': project.name,
            'client': project.client,
            'status': project.status,
            'priority': project.priority,
            'budget': project.budget,
            'spent': project.spent,
            'budget_utilization': round(project.budget_utilization, 1),
            'completion_percentage': round(project.completion_percentage, 1),
            'estimated_hours': round(estimated_hours, 1),
            'actual_hours': round(actual_hours, 1),
            'hours_utilization': round(actual_hours / estimated_hours * 100, 1) if estimated_hours > 0 else 0,
            'start_date': project.start_date.strftime('%Y-%m-%d') if project.start_date else None,
            'end_date': project.end_date.strftime('%Y-%m-%d') if project.end_date else None,
            'task_count': len(project.tasks)
        })
    
    return jsonify(projects_data)

# Project Management Routes
@app.route('/projects')
def projects_page():
    """Projects management page"""
    return render_template('projects.html')

@app.route('/team')
def team_page():
    """Team management page"""
    return render_template('team.html')

@app.route('/gantt')
def gantt_page():
    """GANTT chart page (Frappe Gantt only)"""
    return render_template('gantt_frappe.html')

@app.route('/debug')
def debug_page():
    """Simple debug page for troubleshooting"""
    return render_template('debug_simple.html')

@app.route('/gantt-test')
def gantt_test_page():
    """GANTT test page for debugging chart rendering"""
    return render_template('gantt_test_simple.html')

# Task Group Management Routes
@app.route('/api/projects/<int:project_id>/task-groups')
def get_task_groups(project_id):
    """Get all task groups for a project in hierarchical structure"""
    project = Project.query.get_or_404(project_id)
    
    # Get root groups (no parent)
    root_groups = TaskGroup.query.filter_by(
        project_id=project_id,
        parent_group_id=None
    ).order_by(TaskGroup.sort_order).all()
    
    def build_group_data(group):
        subgroups_data = []
        for subgroup in sorted(group.subgroups, key=lambda x: x.sort_order):
            subgroups_data.append(build_group_data(subgroup))
        
        return {
            'id': group.id,
            'name': group.name,
            'description': group.description,
            'color': group.color,
            'is_expanded': group.is_expanded,
            'sort_order': group.sort_order,
            'parent_group_id': group.parent_group_id,
            'task_count': group.task_count,
            'all_task_count': group.all_task_count,
            'completion_percentage': round(group.completion_percentage, 1),
            'earliest_start': group.earliest_start.strftime('%Y-%m-%d') if group.earliest_start else None,
            'latest_end': group.latest_end.strftime('%Y-%m-%d') if group.latest_end else None,
            'subgroups': subgroups_data
        }
    
    groups_data = [build_group_data(group) for group in root_groups]
    
    return jsonify(groups_data)

@app.route('/api/projects/<int:project_id>/task-groups', methods=['POST'])
def create_task_group(project_id):
    """Create a new task group"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    try:
        group = TaskGroup(
            name=data['name'],
            description=data.get('description', ''),
            project_id=project_id,
            parent_group_id=data.get('parent_group_id'),
            color=data.get('color', '#667eea'),
            sort_order=int(data.get('sort_order', 0))
        )
        
        db.session.add(group)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Task group created successfully',
            'group': {
                'id': group.id,
                'name': group.name,
                'color': group.color,
                'sort_order': group.sort_order
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error creating task group: {str(e)}'
        }), 400

@app.route('/api/task-groups/<int:group_id>', methods=['PUT'])
def update_task_group(group_id):
    """Update a task group"""
    group = TaskGroup.query.get_or_404(group_id)
    data = request.get_json()
    
    try:
        if 'name' in data:
            group.name = data['name']
        if 'description' in data:
            group.description = data['description']
        if 'color' in data:
            group.color = data['color']
        if 'is_expanded' in data:
            group.is_expanded = data['is_expanded']
        if 'sort_order' in data:
            group.sort_order = int(data['sort_order'])
        if 'parent_group_id' in data:
            group.parent_group_id = data['parent_group_id']
        
        group.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Task group updated successfully',
            'group': {
                'id': group.id,
                'name': group.name,
                'color': group.color,
                'is_expanded': group.is_expanded
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating task group: {str(e)}'
        }), 400

@app.route('/api/task-groups/<int:group_id>', methods=['DELETE'])
def delete_task_group(group_id):
    """Delete a task group (tasks are moved to parent group or ungrouped)"""
    group = TaskGroup.query.get_or_404(group_id)
    
    try:
        parent_id = group.parent_group_id
        
        # Move tasks to parent group or ungroup them
        for task in group.tasks:
            task.group_id = parent_id
        
        # Move subgroups to parent group
        for subgroup in group.subgroups:
            subgroup.parent_group_id = parent_id
        
        db.session.delete(group)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Task group deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error deleting task group: {str(e)}'
        }), 400

@app.route('/api/task-groups/<int:group_id>/toggle', methods=['POST'])
def toggle_task_group(group_id):
    """Toggle expand/collapse state of a task group"""
    group = TaskGroup.query.get_or_404(group_id)
    
    try:
        group.is_expanded = not group.is_expanded
        group.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'is_expanded': group.is_expanded,
            'message': f'Group {"expanded" if group.is_expanded else "collapsed"}'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error toggling group: {str(e)}'
        }), 400

@app.route('/api/tasks/<int:task_id>/group', methods=['PUT'])
def update_task_group_assignment(task_id):
    """Assign task to a group or change its group"""
    task = Task.query.get_or_404(task_id)
    data = request.get_json()
    
    try:
        group_id = data.get('group_id')
        
        # Validate group exists and belongs to same project
        if group_id:
            group = TaskGroup.query.get_or_404(group_id)
            if group.project_id != task.project_id:
                return jsonify({
                    'success': False,
                    'message': 'Group must belong to the same project as the task'
                }), 400
        
        task.group_id = group_id
        if 'sort_order' in data:
            task.sort_order = int(data['sort_order'])
        
        task.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Task group assignment updated successfully',
            'task': {
                'id': task.id,
                'group_id': task.group_id,
                'sort_order': task.sort_order
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating task group assignment: {str(e)}'
        }), 400

@app.route('/api/projects', methods=['POST'])
def create_project():
    """Create a new project"""
    data = request.get_json()
    
    try:
        project = Project(
            name=data['name'],
            description=data.get('description', ''),
            client=data['client'],
            project_manager=data.get('project_manager', ''),
            status=data.get('status', 'Active'),
            priority=data.get('priority', 'Medium'),
            budget=float(data.get('budget', 0)),
            start_date=datetime.strptime(data['start_date'], '%Y-%m-%d').date(),
            end_date=datetime.strptime(data['end_date'], '%Y-%m-%d').date() if data.get('end_date') else None
        )
        
        db.session.add(project)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Project created successfully',
            'project_id': project.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error creating project: {str(e)}'
        }), 400

@app.route('/api/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    """Update an existing project"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    try:
        project.name = data.get('name', project.name)
        project.description = data.get('description', project.description)
        project.client = data.get('client', project.client)
        project.project_manager = data.get('project_manager', project.project_manager)
        project.status = data.get('status', project.status)
        project.priority = data.get('priority', project.priority)
        project.budget = float(data.get('budget', project.budget))
        
        if data.get('start_date'):
            project.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
        if data.get('end_date'):
            project.end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
        
        project.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Project updated successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating project: {str(e)}'
        }), 400

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Delete a project"""
    project = Project.query.get_or_404(project_id)
    
    try:
        db.session.delete(project)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Project deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error deleting project: {str(e)}'
        }), 400

@app.route('/api/projects/<int:project_id>')
def get_project_details(project_id):
    """Get detailed project information"""
    project = Project.query.get_or_404(project_id)
    
    project_data = {
        'id': project.id,
        'name': project.name,
        'description': project.description,
        'client': project.client,
        'project_manager': project.project_manager,
        'status': project.status,
        'priority': project.priority,
        'budget': project.budget,
        'spent': project.spent,
        'budget_utilization': round(project.budget_utilization, 1),
        'completion_percentage': round(project.completion_percentage, 1),
        'start_date': project.start_date.strftime('%Y-%m-%d') if project.start_date else None,
        'end_date': project.end_date.strftime('%Y-%m-%d') if project.end_date else None,
        'created_at': project.created_at.strftime('%Y-%m-%d %H:%M:%S'),
        'team_members': [{'id': tm.id, 'name': tm.name, 'role': tm.role} for tm in project.team_members],
        'tasks': [{
            'id': task.id,
            'title': task.title,
            'status': task.status,
            'priority': task.priority,
            'estimated_hours': task.estimated_hours,
            'actual_hours': task.actual_hours,
            'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
            'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
            'assigned_members': [{'id': tm.id, 'name': tm.name} for tm in task.assigned_team_members]
        } for task in project.tasks]
    }
    
    return jsonify(project_data)

@app.route('/api/projects/<int:project_id>/tasks')
def get_project_tasks(project_id):
    """Get all tasks for a specific project (for GANTT chart)"""
    try:
        project = Project.query.get_or_404(project_id)
        tasks = project.tasks
        
        tasks_data = []
        for task in tasks:
            # Get assignee name if available
            assignee_name = None
            if task.assignee:
                assignee_name = task.assignee.name
            
            # Get dependencies
            dependencies = []
            for dep in task.dependencies:
                dependencies.append({
                    'id': dep.predecessor_task_id,
                    'type': dep.dependency_type,
                    'lag_days': dep.lag_days,
                    'maintain_lag_only': dep.maintain_lag_only if dep.maintain_lag_only is not None else True
                })
            
            task_data = {
                'id': task.id,
                'title': task.title,
                'name': task.title,  # Frappe Gantt uses 'name'
                'description': task.description,
                'status': task.status,
                'priority': task.priority,
                'estimated_hours': task.estimated_hours or 0,
                'actual_hours': task.actual_hours or 0,
                'progress': task.completion_percentage,
                'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
                'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
                'due_date': task.due_date.strftime('%Y-%m-%d') if task.due_date else None,
                'duration_working_days': task.duration_working_days,
                'sort_order': task.sort_order or 0,
                'assignee_id': task.assigned_to,
                'assignee_name': assignee_name,
                'group_id': task.group_id,
                'dependencies': dependencies,
                'fixed_start': task.fixed_start,
                'fixed_end': task.fixed_end,
                'maintain_lag_only': task.maintain_lag_only if hasattr(task, 'maintain_lag_only') else True,
                'created_at': task.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'updated_at': task.updated_at.strftime('%Y-%m-%d %H:%M:%S') if task.updated_at else None,
                'assignments': [
                    {
                        'member_id': a.team_member_id,
                        'name': a.team_member.name,
                        'allocated_hours': a.allocated_hours,
                        'actual_hours': a.actual_hours or 0
                    }
                    for a in task.assignments
                ]
            }
            tasks_data.append(task_data)
        
        return jsonify({
            'success': True,
            'project': {
                'id': project.id,
                'name': project.name,
                'status': project.status
            },
            'tasks': tasks_data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error loading project tasks: {str(e)}'
        }), 500

@app.route('/api/projects/<int:project_id>/budget')
def get_project_budget(project_id):
    """Return per-team-member budget summary for a project."""
    project = Project.query.get_or_404(project_id)
    # Collect all TaskAssignments across all tasks in this project
    member_map = {}
    for task in project.tasks:
        for a in task.assignments:
            tm = a.team_member
            if tm.id not in member_map:
                member_map[tm.id] = {
                    'member_id': tm.id,
                    'name': tm.name,
                    'role': tm.role,
                    'hourly_rate': tm.hourly_rate or 0,
                    'allocated_hours': 0,
                    'actual_hours': 0,
                }
            member_map[tm.id]['allocated_hours'] += a.allocated_hours or 0
            member_map[tm.id]['actual_hours']    += a.actual_hours or 0

    members = []
    for m in member_map.values():
        m['allocated_cost'] = round(m['allocated_hours'] * m['hourly_rate'], 2)
        m['actual_cost']    = round(m['actual_hours']    * m['hourly_rate'], 2)
        members.append(m)

    total_allocated = sum(m['allocated_hours'] for m in members)
    total_actual    = sum(m['actual_hours']    for m in members)
    total_alloc_cost = sum(m['allocated_cost'] for m in members)
    total_actual_cost = sum(m['actual_cost']   for m in members)

    return jsonify({
        'project_id': project.id,
        'project_name': project.name,
        'budget': project.budget,
        'members': members,
        'totals': {
            'allocated_hours': round(total_allocated, 2),
            'actual_hours':    round(total_actual, 2),
            'allocated_cost':  round(total_alloc_cost, 2),
            'actual_cost':     round(total_actual_cost, 2),
        }
    })

# Role Management Routes
@app.route('/api/roles')
def get_roles():
    """Get all roles"""
    roles = Role.query.order_by(Role.name).all()
    return jsonify([{'id': r.id, 'name': r.name} for r in roles])

@app.route('/api/roles', methods=['POST'])
def create_role():
    """Create a new role"""
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Role name is required'}), 400
    if Role.query.filter_by(name=name).first():
        return jsonify({'success': False, 'message': 'Role already exists'}), 400
    try:
        role = Role(name=name)
        db.session.add(role)
        db.session.commit()
        return jsonify({'success': True, 'id': role.id, 'name': role.name}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 400

@app.route('/api/roles/<int:role_id>', methods=['PUT'])
def update_role(role_id):
    """Rename a role"""
    role = Role.query.get_or_404(role_id)
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Role name is required'}), 400
    existing = Role.query.filter_by(name=name).first()
    if existing and existing.id != role_id:
        return jsonify({'success': False, 'message': 'Role already exists'}), 400
    try:
        old_name = role.name
        role.name = name
        # Keep team members using the old role name in sync
        TeamMember.query.filter_by(role=old_name).update({'role': name})
        db.session.commit()
        return jsonify({'success': True, 'id': role.id, 'name': role.name})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 400

@app.route('/api/roles/<int:role_id>', methods=['DELETE'])
def delete_role(role_id):
    """Delete a role"""
    role = Role.query.get_or_404(role_id)
    try:
        db.session.delete(role)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 400

# Team Member Management Routes
@app.route('/api/team-members')
def get_team_members():
    """Get all team members"""
    members = TeamMember.query.filter_by(is_active=True).all()
    
    members_data = []
    for member in members:
        members_data.append({
            'id': member.id,
            'name': member.name,
            'email': member.email,
            'role': member.role,
            'hourly_rate': member.hourly_rate,
            'availability_hours_per_week': member.availability_hours_per_week,
            'project_count': len(member.projects),
            'active_tasks': len([assignment for assignment in member.task_assignments 
                               if assignment.task.status != 'Completed'])
        })
    
    return jsonify(members_data)

@app.route('/api/team-members', methods=['POST'])
def create_team_member():
    """Create a new team member"""
    data = request.get_json()
    
    try:
        member = TeamMember(
            name=data['name'],
            email=data['email'],
            role=data['role'],
            hourly_rate=float(data.get('hourly_rate', 0)),
            availability_hours_per_week=float(data.get('availability_hours_per_week', 40))
        )
        
        db.session.add(member)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Team member created successfully',
            'member_id': member.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error creating team member: {str(e)}'
        }), 400

@app.route('/api/team-members/<int:member_id>', methods=['PUT'])
def update_team_member(member_id):
    """Update an existing team member"""
    member = TeamMember.query.get_or_404(member_id)
    data = request.get_json()
    
    try:
        member.name = data.get('name', member.name)
        member.email = data.get('email', member.email)
        member.role = data.get('role', member.role)
        member.hourly_rate = float(data.get('hourly_rate', member.hourly_rate))
        member.availability_hours_per_week = float(data.get('availability_hours_per_week', member.availability_hours_per_week))
        member.is_active = data.get('is_active', member.is_active)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Team member updated successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating team member: {str(e)}'
        }), 400

@app.route('/api/team-members/<int:member_id>', methods=['DELETE'])
def delete_team_member(member_id):
    """Delete a team member (soft delete)"""
    member = TeamMember.query.get_or_404(member_id)
    
    try:
        # Soft delete - mark as inactive
        member.is_active = False
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Team member deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error deleting team member: {str(e)}'
        }), 400

# Task Management Routes
@app.route('/api/tasks')
def get_all_tasks():
    """Get all tasks across all projects"""
    tasks = Task.query.all()
    
    tasks_data = []
    for task in tasks:
        task_dict = {
            'id': task.id,
            'name': task.title,
            'title': task.title,
            'description': task.description,
            'status': task.status,
            'priority': task.priority,
            'estimated_hours': task.estimated_hours,
            'actual_hours': task.actual_hours,
            'duration_working_days': task.duration_working_days,
            'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
            'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
            'due_date': task.due_date.strftime('%Y-%m-%d') if task.due_date else None,
            'project_id': task.project_id,
            'progress': int(task.completion_percentage),
            'created_at': task.created_at.strftime('%Y-%m-%d %H:%M:%S') if task.created_at else None,
            'updated_at': task.updated_at.strftime('%Y-%m-%d %H:%M:%S') if task.updated_at else None,
            'group_id': task.group_id,
            'sort_order': task.sort_order
        }
        
        # Add group color if task belongs to a group
        if task.group_id and task.group:
            task_dict['group_color'] = task.group.color
            task_dict['group_name'] = task.group.name
        
        tasks_data.append(task_dict)
    
    return jsonify(tasks_data)

@app.route('/api/tasks', methods=['POST'])
def create_task_standalone():
    """Create a new task"""
    data = request.get_json()
    try:
        progress = int(data.get('progress', 0))
        if progress == 100:
            status = 'Completed'
        elif progress == 0:
            status = 'Not Started'
        else:
            status = 'In Progress'
        task = Task(
            title=data.get('name', data.get('title', 'Untitled Task')),
            description=data.get('description', ''),
            status=status,
            priority=data.get('priority', 'Medium'),
            estimated_hours=0,  # calculated from assignments below
            actual_hours=0,
            duration_working_days=int(data.get('duration_working_days', 1)),
            start_date=datetime.strptime(data['start_date'], '%Y-%m-%d').date() if data.get('start_date') else None,
            end_date=datetime.strptime(data['end_date'], '%Y-%m-%d').date() if data.get('end_date') else None,
            due_date=datetime.strptime(data.get('due_date', data['end_date']), '%Y-%m-%d').date() if data.get('end_date') else None,
            project_id=data['project_id'],
            group_id=data.get('group_id'),
            sort_order=int(data.get('sort_order', 0)),
            fixed_start=bool(data.get('fixed_start', False)),
            fixed_end=bool(data.get('fixed_end', False)),
            maintain_lag_only=bool(data.get('maintain_lag_only', True))
        )
        db.session.add(task)
        db.session.flush()  # Get the task ID
        
        # Handle dependencies if provided
        if 'dependencies' in data and data['dependencies']:
            for dep_data in data['dependencies']:
                dependency = TaskDependency(
                    predecessor_task_id=int(dep_data['predecessor_id']),
                    successor_task_id=task.id,
                    dependency_type=dep_data.get('dependency_type', 'finish_to_start'),
                    lag_days=int(dep_data.get('lag', 0)),
                    maintain_lag_only=bool(dep_data.get('maintain_lag_only', True))
                )
                db.session.add(dependency)
                print(f"Added dependency: {dep_data['predecessor_id']} -> {task.id} ({dependency.dependency_type})")
        
        # Handle team member assignments (multi-member)
        if 'assignments' in data and data['assignments']:
            total_planned = 0
            total_spent = 0
            for a in data['assignments']:
                planned = float(a.get('allocated_hours', 0))
                spent   = float(a.get('actual_hours', 0))
                total_planned += planned
                total_spent   += spent
                db.session.add(TaskAssignment(
                    task_id=task.id,
                    team_member_id=int(a['member_id']),
                    allocated_hours=planned,
                    actual_hours=spent,
                    hours_per_week=float(a.get('hours_per_week', 0)),
                    weeks_allocated=float(a.get('weeks_allocated', 0))
                ))
            task.estimated_hours = total_planned
            task.actual_hours    = total_spent
        elif 'assigned_to' in data and data['assigned_to']:
            # Legacy fallback for single assignee
            db.session.add(TaskAssignment(
                task_id=task.id,
                team_member_id=int(data['assigned_to']),
                allocated_hours=0,
                hours_per_week=0,
                weeks_allocated=0
            ))
        
        db.session.commit()
        
        task_result = {
            'id': task.id,
            'name': task.title,
            'title': task.title,
            'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
            'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
            'project_id': task.project_id,
            'status': task.status,
            'priority': task.priority,
            'progress': progress,
            'group_id': task.group_id,
            'sort_order': task.sort_order
        }
        
        # Add group color if task belongs to a group
        if task.group_id and task.group:
            task_result['group_color'] = task.group.color
            task_result['group_name'] = task.group.name
        
        return jsonify({
            'success': True,
            'message': 'Task created successfully',
            'task': task_result
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': f'Error creating task: {str(e)}'
        }), 400

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """Update an existing task"""
    task = Task.query.get_or_404(task_id)
    data = request.get_json()
    
    try:
        # Update task fields
        task.title = data.get('name', data.get('title', task.title))
        task.description = data.get('description', task.description)
        task.priority = data.get('priority', task.priority)
        # estimated_hours and actual_hours are derived from assignments (see below)
        if 'actual_hours' in data:
            task.actual_hours = float(data['actual_hours'])
        task.duration_working_days = int(data.get('duration_working_days', task.duration_working_days))
        if data.get('start_date'):
            task.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
        if data.get('end_date'):
            task.end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
        if data.get('due_date'):
            task.due_date = datetime.strptime(data['due_date'], '%Y-%m-%d').date()
        if 'group_id' in data:
            task.group_id = data['group_id']
        if 'sort_order' in data:
            task.sort_order = int(data['sort_order'])
        
        # Update milestone fields
        if 'fixed_start' in data:
            task.fixed_start = bool(data['fixed_start'])
        if 'fixed_end' in data:
            task.fixed_end = bool(data['fixed_end'])
        if 'maintain_lag_only' in data:
            task.maintain_lag_only = bool(data['maintain_lag_only'])
        
        # Update status and progress
        if 'progress' in data:
            task.progress = max(0, min(100, int(data['progress'])))
        if 'status' in data:
            task.status = data['status']
        task.updated_at = datetime.utcnow()
        
        # Update assignments if provided — recalculate estimated/actual from them
        if 'assignments' in data:
            TaskAssignment.query.filter_by(task_id=task_id).delete()
            total_planned = 0
            total_spent   = 0
            for assignment_data in data['assignments']:
                planned = float(assignment_data['allocated_hours'])
                spent   = float(assignment_data.get('actual_hours', 0))
                total_planned += planned
                total_spent   += spent
                db.session.add(TaskAssignment(
                    task_id=task_id,
                    team_member_id=assignment_data['member_id'],
                    allocated_hours=planned,
                    actual_hours=spent,
                    hours_per_week=float(assignment_data.get('hours_per_week', 0)),
                    weeks_allocated=float(assignment_data.get('weeks_allocated', 0))
                ))
            task.estimated_hours = total_planned
            task.actual_hours    = total_spent
        
        # Handle dependencies if provided
        if 'dependencies' in data:
            # Remove existing dependencies for this task
            TaskDependency.query.filter_by(successor_task_id=task_id).delete()
            
            # Add new dependencies
            for dep_data in data['dependencies']:
                dependency = TaskDependency(
                    predecessor_task_id=int(dep_data['predecessor_id']),
                    successor_task_id=task_id,
                    dependency_type=dep_data.get('dependency_type', 'finish_to_start'),
                    lag_days=int(dep_data.get('lag', 0)),
                    maintain_lag_only=bool(dep_data.get('maintain_lag_only', True))
                )
                db.session.add(dependency)
                print(f"Added dependency: {dep_data['predecessor_id']} -> {task_id} ({dependency.dependency_type})")
        
        # Handle assigned team member (legacy fallback — skip when assignments were already processed)
        if 'assignments' not in data and 'assigned_to' in data and data['assigned_to']:
            # Clear existing assignments and add new one
            TaskAssignment.query.filter_by(task_id=task_id).delete()
            assignment = TaskAssignment(
                task_id=task_id,
                team_member_id=int(data['assigned_to']),
                allocated_hours=task.estimated_hours,
                hours_per_week=40.0,
                weeks_allocated=1.0
            )
            db.session.add(assignment)
        
        db.session.commit()
        
        task_result = {
            'id': task.id,
            'name': task.title,
            'title': task.title,
            'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
            'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
            'status': task.status,
            'priority': task.priority,
            'progress': int(data['progress']) if 'progress' in data else task.completion_percentage,
            'group_id': task.group_id,
            'sort_order': task.sort_order,
            'fixed_start': task.fixed_start,
            'fixed_end': task.fixed_end,
            'maintain_lag_only': task.maintain_lag_only if hasattr(task, 'maintain_lag_only') else True
        }
        
        # Add group color if task belongs to a group
        if task.group_id and task.group:
            task_result['group_color'] = task.group.color
            task_result['group_name'] = task.group.name
        
        return jsonify({
            'success': True,
            'message': 'Task updated successfully',
            'task': task_result
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating task: {str(e)}'
        }), 400

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    task = Task.query.get_or_404(task_id)
    
    try:
        # Delete related assignments and dependencies
        TaskAssignment.query.filter_by(task_id=task_id).delete()
        TaskDependency.query.filter(
            (TaskDependency.predecessor_task_id == task_id) |
            (TaskDependency.successor_task_id == task_id)
        ).delete()
        
        # Delete the task
        db.session.delete(task)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Task deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error deleting task: {str(e)}'
        }), 400

@app.route('/api/tasks/<int:task_id>/dates', methods=['PUT'])
def update_task_dates(task_id):
    """Update task start and end dates (for GANTT drag-and-drop) with dependency validation"""
    task = Task.query.get_or_404(task_id)
    data = request.get_json()
    try:
        new_start = None
        if 'start_date' in data:
            new_start = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
        new_end = None
        if 'end_date' in data:
            new_end = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
        if 'duration_working_days' in data:
            task.duration_working_days = int(data['duration_working_days'])
        
        # Validate all dependency types with lag (using working days).
        # task.dependencies = incoming deps; dep.predecessor = the upstream task.
        for dep in task.dependencies:
            pred = dep.predecessor
            lag = dep.lag_days or 0
            if not pred:
                continue

            # FS: successor must start strictly after predecessor ends + lag days
            if dep.dependency_type == 'finish_to_start' and pred.end_date:
                min_start = add_working_days(pred.end_date, lag + 1)
                if new_start and new_start < min_start:
                    return jsonify({
                        'success': False,
                        'type': 'FS',
                        'message': f'Task cannot start before predecessor (ID {pred.id}) finishes + {lag} working days.',
                        'min_start_date': min_start.strftime('%Y-%m-%d')
                    }), 400

            # SS: successor starts no earlier than predecessor start + lag days
            if dep.dependency_type == 'start_to_start' and pred.start_date:
                min_start = add_working_days(pred.start_date, lag)
                if new_start and new_start < min_start:
                    return jsonify({
                        'success': False,
                        'type': 'SS',
                        'message': f'Task cannot start before predecessor (ID {pred.id}) starts + {lag} working days.',
                        'min_start_date': min_start.strftime('%Y-%m-%d')
                    }), 400

            # FF: successor ends no earlier than predecessor end + lag days
            if dep.dependency_type == 'finish_to_finish' and pred.end_date:
                min_end = add_working_days(pred.end_date, lag)
                if new_end and new_end < min_end:
                    return jsonify({
                        'success': False,
                        'type': 'FF',
                        'message': f'Task cannot end before predecessor (ID {pred.id}) ends + {lag} working days.',
                        'min_end_date': min_end.strftime('%Y-%m-%d')
                    }), 400

            # SF: successor ends no earlier than predecessor start + lag days
            if dep.dependency_type == 'start_to_finish' and pred.start_date:
                min_end = add_working_days(pred.start_date, lag)
                if new_end and new_end < min_end:
                    return jsonify({
                        'success': False,
                        'type': 'SF',
                        'message': f'Task cannot end before predecessor (ID {pred.id}) starts + {lag} working days.',
                        'min_end_date': min_end.strftime('%Y-%m-%d')
                    }), 400
        
        # If validation passes, update dates
        if new_start:
            task.start_date = new_start
        if new_end:
            task.end_date = new_end
        
        # Recalculate duration based on working days
        if task.start_date and task.end_date:
            task.duration_working_days = count_working_days(task.start_date, task.end_date)
        
        task.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Task dates updated successfully',
            'task': {
                'id': task.id,
                'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
                'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
                'duration_working_days': task.duration_working_days
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating task dates: {str(e)}'
        }), 400

# Task Dependency Management Routes
@app.route('/api/task-dependencies')
def get_task_dependencies():
    """Get all task dependencies"""
    deps = TaskDependency.query.all()
    
    deps_data = []
    for dep in deps:
        deps_data.append({
            'id': dep.id,
            'predecessor_id': dep.predecessor_task_id,
            'successor_id': dep.successor_task_id,
            'dependency_type': dep.dependency_type,
            'lag_days': dep.lag_days,
            'created_at': dep.created_at.strftime('%Y-%m-%d %H:%M:%S') if dep.created_at else None
        })
    
    return jsonify(deps_data)

@app.route('/api/task-dependencies', methods=['POST'])
def create_task_dependency():
    """Create a new task dependency and auto-adjust successor dates"""
    data = request.get_json()
    try:
        pred_id = data.get('predecessor_id')
        succ_id = data.get('successor_id')
        if pred_id is None or succ_id is None:
            return jsonify({'success': False, 'error': 'predecessor_id and successor_id are required'}), 400
        if pred_id == succ_id:
            return jsonify({'success': False, 'error': 'A task cannot depend on itself'}), 400
        dep_type_map = {
            'FS': 'finish_to_start',
            'SS': 'start_to_start',
            'FF': 'finish_to_finish',
            'SF': 'start_to_finish',
            'finish_to_start': 'finish_to_start',
            'start_to_start': 'start_to_start',
            'finish_to_finish': 'finish_to_finish',
            'start_to_finish': 'start_to_finish',
        }
        dep_type_raw = data.get('dependency_type', 'FS')
        dependency_type = dep_type_map.get(dep_type_raw, 'finish_to_start')
        lag_days = int(data.get('lag_days', 0))
        dependency = TaskDependency(
            predecessor_task_id=pred_id,
            successor_task_id=succ_id,
            dependency_type=dependency_type,
            lag_days=lag_days
        )
        db.session.add(dependency)
        db.session.flush()
        pred_task = Task.query.get(pred_id)
        succ_task = Task.query.get(succ_id)
        updates = []
        if pred_task:
            updates.extend(_enforce_dependency_chain(pred_task))
        if succ_task:
            succ_updates = _enforce_dependency_chain(succ_task)
            if succ_updates:
                existing_ids = {update['id'] for update in updates}
                for update in succ_updates:
                    if update['id'] not in existing_ids:
                        updates.append(update)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Dependency created successfully',
            'dependency': {
                'id': dependency.id,
                'predecessor_id': dependency.predecessor_task_id,
                'successor_id': dependency.successor_task_id,
                'dependency_type': dependency.dependency_type,
                'lag_days': dependency.lag_days
            },
            'updates': updates,
            'auto_adjusted': bool(updates)
        }), 201
    except Exception as e:
        db.session.rollback()
        import traceback
        print('Error in create_task_dependency:', traceback.format_exc())
        return jsonify({'success': False, 'error': f'Error creating dependency: {str(e)}'}), 400

@app.route('/api/task-dependencies/<int:dep_id>', methods=['PUT'])
def update_task_dependency(dep_id):
    """Update a task dependency and auto-adjust successor dates"""
    dependency = TaskDependency.query.get_or_404(dep_id)
    data = request.get_json()
    try:
        dep_type_map = {
            'FS': 'finish_to_start',
            'SS': 'start_to_start',
            'FF': 'finish_to_finish',
            'SF': 'start_to_finish',
            'finish_to_start': 'finish_to_start',
            'start_to_start': 'start_to_start',
            'finish_to_finish': 'finish_to_finish',
            'start_to_finish': 'start_to_finish',
        }
        if 'dependency_type' in data:
            dep_type_raw = data['dependency_type']
            dependency.dependency_type = dep_type_map.get(dep_type_raw, dependency.dependency_type)
        if 'lag_days' in data:
            dependency.lag_days = int(data['lag_days'])
        pred_task = Task.query.get(dependency.predecessor_task_id)
        succ_task = Task.query.get(dependency.successor_task_id)
        updates = []
        if pred_task:
            updates.extend(_enforce_dependency_chain(pred_task))
        if succ_task:
            succ_updates = _enforce_dependency_chain(succ_task)
            if succ_updates:
                existing_ids = {update['id'] for update in updates}
                for update in succ_updates:
                    if update['id'] not in existing_ids:
                        updates.append(update)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Dependency updated successfully',
            'dependency': {
                'id': dependency.id,
                'predecessor_id': dependency.predecessor_task_id,
                'successor_id': dependency.successor_task_id,
                'dependency_type': dependency.dependency_type,
                'lag_days': dependency.lag_days
            },
            'updates': updates,
            'auto_adjusted': bool(updates)
        })
    except Exception as e:
        db.session.rollback()
        import traceback
        print('Error in update_task_dependency:', traceback.format_exc())
        return jsonify({'success': False, 'error': f'Error updating dependency: {str(e)}'}), 400

@app.route('/api/task-dependencies/<int:dep_id>', methods=['DELETE'])
def delete_task_dependency(dep_id):
    """Delete a task dependency"""
    dependency = TaskDependency.query.get_or_404(dep_id)
    try:
        db.session.delete(dependency)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Dependency deleted successfully',
            'dependency_id': dep_id
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error deleting dependency: {str(e)}'
        }), 400

# Task Assignment Management Routes
@app.route('/api/task-assignments', methods=['POST'])
def create_task_assignment():
    """Create a new task assignment"""
    data = request.get_json()
    
    try:
        assignment = TaskAssignment(
            task_id=data['task_id'],
            team_member_id=data['team_member_id'],
            allocated_hours=float(data['allocated_hours']),
            hours_per_week=float(data.get('hours_per_week', 0)),
            weeks_allocated=float(data.get('weeks_allocated', 1))
        )
        
        db.session.add(assignment)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Task assignment created successfully',
            'assignment_id': assignment.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error creating task assignment: {str(e)}'
        }), 400

@app.route('/api/task-assignments/<int:assignment_id>', methods=['DELETE'])
def delete_task_assignment(assignment_id):
    """Delete a task assignment"""
    assignment = TaskAssignment.query.get_or_404(assignment_id)
    
    try:
        db.session.delete(assignment)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Task assignment deleted successfully',
            'assignment_id': assignment_id
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error deleting task assignment: {str(e)}'
        }), 400

# Working Days and Holidays Routes
@app.route('/api/holidays')
def get_holidays():
    """Get Dutch holidays for a date range"""
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    
    try:
        if start_date_str and end_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        else:
            # Default to current year
            start_date = date(datetime.now().year, 1, 1)
            end_date = date(datetime.now().year, 12, 31)
        
        holidays = get_holidays_in_range(start_date, end_date)
        
        holidays_data = [{
            'date': holiday_date.strftime('%Y-%m-%d'),
            'name': name
        } for holiday_date, name in holidays]
        
        return jsonify(holidays_data)
        
    except Exception as e:
        return jsonify({
            'error': f'Error getting holidays: {str(e)}'
        }), 400

@app.route('/api/working-days/calculate', methods=['POST'])
def calculate_working_days_endpoint():
    """Calculate working days between two dates or add/subtract working days"""
    data = request.get_json()
    
    try:
        operation = data.get('operation', 'count')  # count, add, subtract
        
        if operation == 'count':
            start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
            end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
            working_days = count_working_days(start_date, end_date)
            
            return jsonify({
                'success': True,
                'working_days': working_days,
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d')
            })
            
        elif operation == 'add':
            start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
            working_days = int(data['working_days'])
            end_date = add_working_days(start_date, working_days)
            
            return jsonify({
                'success': True,
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d'),
                'working_days_added': working_days
            })
            
        elif operation == 'subtract':
            end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
            working_days = int(data['working_days'])
            start_date = subtract_working_days(end_date, working_days)
            
            return jsonify({
                'success': True,
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d'),
                'working_days_subtracted': working_days
            })
            
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid operation. Use: count, add, or subtract'
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error calculating working days: {str(e)}'
        }), 400

@app.route('/api/tasks/batch-update', methods=['POST'])
def batch_update_tasks():
    """Batch update multiple tasks (for cascading dependency updates)"""
    data = request.get_json()
    
    try:
        if not data or 'tasks' not in data:
            return jsonify({
                'success': False,
                'message': 'No tasks provided for batch update'
            }), 400
        
        tasks_to_update = data['tasks']
        updated_tasks = []
        
        for task_data in tasks_to_update:
            task_id = task_data.get('id')
            if not task_id:
                continue
            
            task = Task.query.get(task_id)
            if not task:
                continue
            
            # Update dates if provided
            if 'start_date' in task_data and task_data['start_date']:
                task.start_date = datetime.strptime(task_data['start_date'], '%Y-%m-%d').date()
            
            if 'end_date' in task_data and task_data['end_date']:
                task.end_date = datetime.strptime(task_data['end_date'], '%Y-%m-%d').date()
            
            # Update duration if provided
            if 'duration_working_days' in task_data:
                task.duration_working_days = int(task_data['duration_working_days'])
            
            # Recalculate duration based on working days if both dates are set
            if task.start_date and task.end_date:
                # Ensure start_date is before end_date
                if task.start_date > task.end_date:
                    print(f"WARNING: Task {task_id} has start_date ({task.start_date}) after end_date ({task.end_date}). Swapping dates.")
                    task.start_date, task.end_date = task.end_date, task.start_date
                
                calculated_duration = count_working_days(task.start_date, task.end_date)
                print(f"Task {task_id}: Calculating duration from {task.start_date} to {task.end_date} = {calculated_duration} working days")
                if calculated_duration > 0:
                    task.duration_working_days = calculated_duration
                else:
                    task.duration_working_days = 1  # Minimum 1 day
            
            task.updated_at = datetime.utcnow()
            
            updated_tasks.append({
                'id': task.id,
                'title': task.title,
                'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
                'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
                'duration_working_days': task.duration_working_days
            })
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Successfully updated {len(updated_tasks)} task(s)',
            'updated_tasks': updated_tasks
        })
        
    except Exception as e:
        db.session.rollback()
        import traceback
        print('Error in batch_update_tasks:', traceback.format_exc())
        return jsonify({
            'success': False,
            'message': f'Error batch updating tasks: {str(e)}'
        }), 400

# ── Import / Export ───────────────────────────────────────────────────────────

@app.route('/api/projects/<int:project_id>/export')
def export_project(project_id):
    """Export project as JSON (default) or CSV (?format=csv)."""
    project = Project.query.get_or_404(project_id)
    fmt = request.args.get('format', 'json')

    # Flat list of all groups preserving hierarchy via parent_id
    all_groups = TaskGroup.query.filter_by(project_id=project_id).order_by(TaskGroup.sort_order).all()
    groups_data = [
        {
            'id': g.id,
            'name': g.name,
            'description': g.description or '',
            'color': g.color,
            'sort_order': g.sort_order,
            'parent_id': g.parent_group_id,
        }
        for g in all_groups
    ]
    group_name_map = {g.id: g.name for g in all_groups}

    # All tasks with their dependencies embedded
    tasks = Task.query.filter_by(project_id=project_id).order_by(Task.sort_order).all()
    tasks_data = []
    for task in tasks:
        deps = [
            {
                'predecessor_id': d.predecessor_task_id,
                'type': d.dependency_type,
                'lag_days': d.lag_days,
            }
            for d in task.dependencies
        ]
        tasks_data.append({
            'id': task.id,
            'title': task.title,
            'description': task.description or '',
            'start_date': task.start_date.strftime('%Y-%m-%d') if task.start_date else None,
            'end_date': task.end_date.strftime('%Y-%m-%d') if task.end_date else None,
            'status': task.status,
            'priority': task.priority,
            'estimated_hours': task.estimated_hours or 0,
            'duration_working_days': task.duration_working_days or 1,
            'group_id': task.group_id,
            'sort_order': task.sort_order or 0,
            'fixed_start': bool(task.fixed_start),
            'fixed_end': bool(task.fixed_end),
            'maintain_lag_only': bool(task.maintain_lag_only) if hasattr(task, 'maintain_lag_only') else True,
            'dependencies': deps,
        })

    safe_name = ''.join(c if c.isalnum() or c in '-_ ' else '_' for c in project.name)

    if fmt == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'id', 'title', 'description', 'start_date', 'end_date',
            'status', 'priority', 'estimated_hours', 'duration_working_days',
            'group_name', 'sort_order', 'fixed_start', 'fixed_end',
            'maintain_lag_only', 'predecessors',
        ])
        for t in tasks_data:
            predecessors = ';'.join(
                f"{d['predecessor_id']}:{d['type']}:{d['lag_days']}"
                for d in t['dependencies']
            )
            writer.writerow([
                t['id'], t['title'], t['description'],
                t['start_date'], t['end_date'],
                t['status'], t['priority'], t['estimated_hours'],
                t['duration_working_days'],
                group_name_map.get(t['group_id'], '') if t['group_id'] else '',
                t['sort_order'], t['fixed_start'], t['fixed_end'],
                t['maintain_lag_only'], predecessors,
            ])
        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename="{safe_name}.csv"'},
        )

    # JSON export
    export_data = {
        'version': '1.0',
        'exported_at': datetime.utcnow().isoformat(),
        'project': {
            'name': project.name,
            'description': project.description or '',
            'client': project.client,
            'project_manager': project.project_manager or '',
            'status': project.status,
            'priority': project.priority,
            'start_date': project.start_date.strftime('%Y-%m-%d') if project.start_date else None,
            'end_date': project.end_date.strftime('%Y-%m-%d') if project.end_date else None,
            'budget': project.budget or 0,
        },
        'groups': groups_data,
        'tasks': tasks_data,
    }
    return Response(
        json.dumps(export_data, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="{safe_name}.json"'},
    )


@app.route('/api/projects/import', methods=['POST'])
def import_project():
    """
    Import a project from a previously exported JSON payload.

    Body (JSON):
      { "data": <export JSON>,
        "target_project_id": <int|null>  # null = create new project
      }
    """
    import traceback
    try:
        body = request.get_json()
        if not body or 'data' not in body:
            return jsonify({'success': False, 'message': 'No import data provided'}), 400

        import_data = body['data']
        target_project_id = body.get('target_project_id')

        if target_project_id:
            project = Project.query.get_or_404(int(target_project_id))
        else:
            proj = import_data.get('project', {})
            project = Project(
                name=proj.get('name', 'Imported Project'),
                description=proj.get('description', ''),
                client=proj.get('client', 'Unknown'),
                project_manager=proj.get('project_manager', ''),
                status=proj.get('status', 'Active'),
                priority=proj.get('priority', 'Medium'),
                budget=float(proj.get('budget', 0)),
                start_date=(
                    datetime.strptime(proj['start_date'], '%Y-%m-%d').date()
                    if proj.get('start_date') else date.today()
                ),
                end_date=(
                    datetime.strptime(proj['end_date'], '%Y-%m-%d').date()
                    if proj.get('end_date') else None
                ),
            )
            db.session.add(project)
            db.session.flush()

        # ── Groups (two-pass: create first, then wire parent) ────────────
        group_id_map = {}   # old_id → new_id
        for g in import_data.get('groups', []):
            new_g = TaskGroup(
                name=g['name'],
                description=g.get('description', ''),
                project_id=project.id,
                color=g.get('color', '#667eea'),
                sort_order=int(g.get('sort_order', 0)),
                parent_group_id=None,
            )
            db.session.add(new_g)
            db.session.flush()
            group_id_map[g['id']] = new_g.id

        for g in import_data.get('groups', []):
            if g.get('parent_id') and g['parent_id'] in group_id_map:
                grp = TaskGroup.query.get(group_id_map[g['id']])
                grp.parent_group_id = group_id_map[g['parent_id']]

        # ── Tasks ────────────────────────────────────────────────────────
        task_id_map = {}    # old_id → new_id
        for t in import_data.get('tasks', []):
            new_group_id = group_id_map.get(t['group_id']) if t.get('group_id') else None
            task = Task(
                title=t['title'],
                description=t.get('description', ''),
                project_id=project.id,
                group_id=new_group_id,
                status=t.get('status', 'Not Started'),
                priority=t.get('priority', 'Medium'),
                estimated_hours=float(t.get('estimated_hours', 0)),
                duration_working_days=int(t.get('duration_working_days', 1)),
                start_date=(
                    datetime.strptime(t['start_date'], '%Y-%m-%d').date()
                    if t.get('start_date') else None
                ),
                end_date=(
                    datetime.strptime(t['end_date'], '%Y-%m-%d').date()
                    if t.get('end_date') else None
                ),
                sort_order=int(t.get('sort_order', 0)),
                fixed_start=bool(t.get('fixed_start', False)),
                fixed_end=bool(t.get('fixed_end', False)),
                maintain_lag_only=bool(t.get('maintain_lag_only', True)),
            )
            task.due_date = task.end_date
            db.session.add(task)
            db.session.flush()
            task_id_map[t['id']] = task.id

        # ── Dependencies ─────────────────────────────────────────────────
        for t in import_data.get('tasks', []):
            new_succ_id = task_id_map.get(t['id'])
            for dep in t.get('dependencies', []):
                new_pred_id = task_id_map.get(dep['predecessor_id'])
                if new_pred_id and new_succ_id:
                    db.session.add(TaskDependency(
                        predecessor_task_id=new_pred_id,
                        successor_task_id=new_succ_id,
                        dependency_type=dep.get('type', 'finish_to_start'),
                        lag_days=int(dep.get('lag_days', 0)),
                    ))

        db.session.commit()
        n_tasks = len(import_data.get('tasks', []))
        n_groups = len(import_data.get('groups', []))
        return jsonify({
            'success': True,
            'message': f'Imported {n_tasks} tasks and {n_groups} groups',
            'project_id': project.id,
            'project_name': project.name,
            'tasks_imported': n_tasks,
            'groups_imported': n_groups,
        })

    except Exception as e:
        db.session.rollback()
        print('Error in import_project:', traceback.format_exc())
        return jsonify({'success': False, 'message': f'Import failed: {str(e)}'}), 400


@app.route('/api/projects/import-csv', methods=['POST'])
def import_project_csv():
    """
    Import tasks from a CSV file (matching the CSV export format).

    Form fields:
      file              — the .csv file
      target_project_id — int (add to existing) or empty (create new project)
      project_name      — used when creating a new project
    """
    import traceback
    try:
        f = request.files.get('file')
        if not f:
            return jsonify({'success': False, 'message': 'No file provided'}), 400

        target_project_id = request.form.get('target_project_id', '').strip()
        project_name      = request.form.get('project_name', 'Imported Project').strip()

        raw = f.read()
        for enc in ('utf-8-sig', 'cp1252', 'latin-1'):
            try:
                text = raw.decode(enc)
                break
            except (UnicodeDecodeError, LookupError):
                pass
        else:
            text = raw.decode('latin-1')  # latin-1 never fails
        first_line = text.split('\n')[0]
        delim  = ';' if ';' in first_line else ','
        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        rows   = list(reader)

        if not rows:
            return jsonify({'success': False, 'message': 'CSV file is empty'}), 400

        # Validate required columns
        required = {'title', 'start_date', 'end_date'}
        missing  = required - set(rows[0].keys())
        if missing:
            return jsonify({'success': False,
                            'message': f'Missing CSV columns: {", ".join(missing)}'}), 400

        if target_project_id:
            project = Project.query.get_or_404(int(target_project_id))
        else:
            project = Project(
                name=project_name,
                client='Unknown',
                status='Active',
                priority='Medium',
                start_date=date.today(),
            )
            db.session.add(project)
            db.session.flush()

        # Build group_name → group_id map (create missing groups on the fly)
        group_name_map = {g.name: g.id for g in TaskGroup.query.filter_by(project_id=project.id).all()}

        # First pass: create all tasks, collect old_id → new task
        old_id_map = {}   # csv id string → new Task
        for row in rows:
            # Resolve / create group
            group_id = None
            gname    = (row.get('group_name') or '').strip()
            if gname:
                if gname not in group_name_map:
                    new_g = TaskGroup(name=gname, project_id=project.id,
                                      color='#667eea', sort_order=0)
                    db.session.add(new_g)
                    db.session.flush()
                    group_name_map[gname] = new_g.id
                group_id = group_name_map[gname]

            def parse_date(s):
                s = (s or '').strip()
                if not s:
                    return None
                for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y'):
                    try:
                        return datetime.strptime(s, fmt).date()
                    except ValueError:
                        pass
                raise ValueError(f'Unrecognised date format: {s}')

            def parse_bool(s):
                return str(s).strip().lower() in ('true', '1', 'yes')

            task = Task(
                title=row.get('title', '').strip() or 'Untitled',
                description=(row.get('description') or '').strip(),
                project_id=project.id,
                group_id=group_id,
                status=row.get('status', 'Not Started').strip() or 'Not Started',
                priority=row.get('priority', 'Medium').strip() or 'Medium',
                estimated_hours=float(row.get('estimated_hours') or 0),
                duration_working_days=int(row.get('duration_working_days') or 1),
                start_date=parse_date(row.get('start_date')),
                end_date=parse_date(row.get('end_date')),
                sort_order=int(row.get('sort_order') or 0),
                fixed_start=parse_bool(row.get('fixed_start')),
                fixed_end=parse_bool(row.get('fixed_end')),
                maintain_lag_only=parse_bool(row.get('maintain_lag_only') or 'true'),
            )
            task.due_date = task.end_date
            db.session.add(task)
            db.session.flush()
            csv_id = (row.get('id') or '').strip()
            if csv_id:
                old_id_map[csv_id] = task

        # Second pass: dependencies  (format: "pred_id:type:lag;...")
        for row in rows:
            csv_id    = (row.get('id') or '').strip()
            preds_str = (row.get('predecessors') or '').strip()
            if not csv_id or not preds_str or csv_id not in old_id_map:
                continue
            succ_task = old_id_map[csv_id]
            for part in preds_str.split(';'):
                part = part.strip()
                if not part:
                    continue
                bits = part.split(':')
                pred_csv_id  = bits[0].strip()
                dep_type     = bits[1].strip() if len(bits) > 1 else 'finish_to_start'
                lag          = int(bits[2]) if len(bits) > 2 else 0
                if pred_csv_id in old_id_map:
                    db.session.add(TaskDependency(
                        predecessor_task_id=old_id_map[pred_csv_id].id,
                        successor_task_id=succ_task.id,
                        dependency_type=dep_type,
                        lag_days=lag,
                    ))

        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'Imported {len(rows)} tasks from CSV',
            'project_id': project.id,
            'project_name': project.name,
            'tasks_imported': len(rows),
        })

    except Exception as e:
        db.session.rollback()
        print('Error in import_project_csv:', traceback.format_exc())
        return jsonify({'success': False, 'message': f'CSV import failed: {str(e)}'}), 400


# Ensure all tables exist and seed defaults (runs on every startup regardless of entry point)
with app.app_context():
    db.create_all()
    # Safe column additions for existing databases
    with db.engine.connect() as conn:
        for sql in [
            "ALTER TABLE task ADD COLUMN progress INTEGER DEFAULT 0",
        ]:
            try:
                conn.execute(db.text(sql))
                conn.commit()
            except Exception:
                pass  # column already exists
    if Role.query.count() == 0:
        for rname in DEFAULT_ROLES:
            db.session.add(Role(name=rname))
        db.session.commit()

# Run the Flask development server
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
