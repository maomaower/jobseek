import React from 'react'
import JobDashboard from './components/JobDashboard'
import './index.css'

function App() {
  return (
    <div className="app-container">
      <header>
        <h1>JobSeeq</h1>
        <p>Curated opportunities, delivered daily.</p>
      </header>
      
      <JobDashboard />
    </div>
  )
}

export default App
