import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import Broadcaster from './components/Broadcaster';
import Consume from './components/Consume';
import List from './components/List';
import 'bootstrap/dist/css/bootstrap.min.css';
import ConsumerLink from './components/ConsumerLink';
import Login from './components/Login';

export const AuthContext = createContext(null);

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(()=>{
    const timestamp = localStorage.getItem('timestamp');
    const token = localStorage.getItem('token');

    // Check if both timestamp and token exist
    if (timestamp && token) {
        const currentTime = new Date().getTime();
        const timestampTime = new Date(parseInt(timestamp)).getTime();

        // Check if the timestamp is older than 24 hours
        const hoursDiff = (currentTime - timestampTime) / (1000 * 60 * 60);
        if (hoursDiff > 24) {
            // Timestamp is older than 24 hours
            return false;
        }
        // Both timestamp and token exist, and timestamp is within 24 hours
        return true;
    } else {
        // Either timestamp or token, or both, do not exist
        
        return false;
    }
  });

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, handleLogin, handleLogout }}>
    <div className="App">
      <Router>
        {/* Routes */}
        <Routes>
          <Route path='/login' element={<Login  onLogin={handleLogin} ></Login>}></Route>
          <Route path='/broadcaster' element={<ProtectedRoute><Broadcaster /></ProtectedRoute>} />
          <Route path='/' element={<Consume />} />
          <Route path='/list' element={<ProtectedRoute><List /></ProtectedRoute>} />
          <Route path='/room/:id' element={<ConsumerLink />} />
        </Routes>
      </Router>
    </div>
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ children }) {
  const auth = useContext(AuthContext);

  if (!auth.isLoggedIn) {
    // Redirect them to the /login page, but save the current location they were
    // trying to go to when they were redirected. This allows us to send them
    // along to that page after they login, which is a nicer user experience
    // than dropping them off on the home page.
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default App;
