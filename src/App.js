import logo from './logo.svg';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Broadcaster from './components/Broadcaster'
import Consume from './components/Consume';

function App() {
  return (
    <div className="App">
		<Router>
			<Routes>
				<Route path='/' element={<Broadcaster></Broadcaster>}></Route>
				<Route path='/consume' element={<Consume></Consume>}></Route>
			</Routes>
		</Router>
    </div>
  );
}

export default App;
