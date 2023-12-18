import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [btnState,setBtnState] = useState(false)
  const [btnText, setLoginBtn] = useState("Login")
  const navigate = useNavigate();
  const notyf = new Notyf();

  const handleLogin = async () => {
    try {
      setBtnState(true)
          setLoginBtn("Loading")
          const response = await axios.post(`https://api.safetixstreaming.com/public/api/auth/login`,
          {
            email: username,
            password: password,
          },{
            headers: {
              Authorization: localStorage.getItem("token")
            }
          });
          if (response.data) {
            notyf.success("Logged in successfully");
            const token = response.data.token;
            localStorage.setItem('token', token);
            localStorage.setItem('timestamp', new Date().getTime())
            // setAuth(true);
            setBtnState(false)
          } else {        
          notyf.error("A network error  Occured Please try again");
            console.error("Login failed");
            setBtnState(false)
            setLoginBtn("Login")
          }
      if (username && password) {
        setError(null);
        // Call the onLogin prop to update the parent component's login state
        navigate('/broadcaster')
        onLogin();
      } else {
        setError('Invalid username or password');
        setBtnState(false)
      }
    } catch (error) {
      console.error('Error during login:', error);
      setError('An error occurred during login');
      notyf.error(error.response.data.message);
      console.error("An error occurred during login:", error.response.data.message);
      setBtnState(false)
      setLoginBtn("Login")
    }
  };

  return (
    <div>
        <div className='d-flex justify-content-center align-items-center p-5 mt-5'>
            <div className='my-auto d-flex flex-column p-5 width-form card blur' style={{boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)", backgroundColor: "rgb(255,255,255,0.4)"}}>
        <div className="mb-3 w-100 m-3">
        <label htmlFor="exampleFormControlInput1" className="form-label text">Email address</label>
        <input 
        type="email" 
        className="form-control input" 
        id="exampleFormControlInput1" 
        placeholder="Email Address"
        onChange={(e)=>setUsername(e.target.value)}
        />
        </div>
        <div className="mb-3 w-100 m-3">
            <label htmlFor="inputPassword5" 
            placeholder="Email Address" className="form-label text">Password</label>
            <input 
            type="password"
            id="inputPassword5" 
            className="form-control  input" 
            aria-describedby="passwordHelpBlock"
            onChange={(e)=>setPassword(e.target.value)}
            />
        </div>
        <div className='mx-auto'>
        <button className='btn' 
        style={{
          background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))",
          border: "none",
          color: "white"
        }}
        onClick={handleLogin} disabled={btnState}>{btnText}</button>
        </div>
            </div>
        </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default Login;