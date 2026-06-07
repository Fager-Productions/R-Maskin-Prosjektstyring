import type { AppState, TaskItem } from '../../lib/types'
import { uid } from '../../lib/utils'

const now = (): string => new Date().toISOString()

export const addTask = (
  state: AppState,
  projectId: string,
  payload: { title: string; description: string; dueDate: string },
): AppState => {
  const task: TaskItem = {
    id: uid(),
    title: payload.title,
    description: payload.description,
    dueDate: payload.dueDate,
  }

  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) {
        return project
      }
      return {
        ...project,
        updatedAt: now(),
        tasks: [...project.tasks, task],
      }
    }),
  }
}

export const updateTask = (
  state: AppState,
  projectId: string,
  taskId: string,
  payload: { title: string; description: string; dueDate: string },
): AppState => {
  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) {
        return project
      }

      return {
        ...project,
        updatedAt: now(),
        tasks: project.tasks.map((task) => {
          if (task.id !== taskId) {
            return task
          }

          return {
            ...task,
            title: payload.title,
            description: payload.description,
            dueDate: payload.dueDate,
          }
        }),
      }
    }),
  }
}

export const deleteTask = (state: AppState, projectId: string, taskId: string): AppState => {
  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) {
        return project
      }

      return {
        ...project,
        updatedAt: now(),
        tasks: project.tasks.filter((task) => task.id !== taskId),
      }
    }),
  }
}

export const toggleTaskDone = (
  state: AppState,
  projectId: string,
  taskId: string,
): AppState => {
  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) {
        return project
      }

      return {
        ...project,
        updatedAt: now(),
        tasks: project.tasks.map((task) => {
          if (task.id !== taskId) {
            return task
          }

          if (task.completedAt) {
            const { completedAt, ...taskWithoutCompletion } = task
            void completedAt
            return taskWithoutCompletion
          }

          return {
            ...task,
            completedAt: now(),
          }
        }),
      }
    }),
  }
}
