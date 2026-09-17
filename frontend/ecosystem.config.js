module.exports = {
  apps: [
    {
      name: "todo-frontend",
      cwd: "D:/source-personal/todo/frontend",
      script: "cmd.exe",
      args: "/c serve -s build -l 3000",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};