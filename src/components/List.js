import React, {useState, useEffect} from 'react'
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';
import 'bootstrap/dist/css/bootstrap.min.css';
import { IoMdClose } from "react-icons/io";
import Helpers from '../Helpers/Helpers';

export default function List() {
  let socket;
  const [rooms, setRooms] = useState([])

  useEffect(()=>{
    socket = io(`https://127.0.0.1:8000`);
    socket.on("newUser", (data)=>{
      // console.log("Routers ",data)
      setRooms(Object.values(data))
      // console.log("Rooms", rooms)
    })
  })

  function deleteRoom(roomName){
    socket.emit("tracksEnded", `Tracks ended for room Named: ${roomName}`)
  }

  return (
    <div className='centered-row'>
      <h1 className='heading'>List of Rooms</h1>      
    <div style={{display: "block", width: "100%"}} className='row d-flex justify-content-evenly'>
    {rooms.map((room)=>{
      return(
      <div 
      onClick={()=>deleteRoom(room.room)}
      key={room.roomId}
      // className={`d-flex flex-row justify-content-between align-items-center p-5 border rounded m-auto my-1 w-100`}
      className={`d-flex flex-row justify-content-between align-items-center col-md-3 blur card p-5 my-3 scale delete`}
      style={{boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)", backgroundColor: "rgb(255,255,255,0.4)"}}
      >
        <div className='d-flex flex-column justif-content-center align-items-start'>
          <h5 className='heading'>{room.room}</h5>
          <p 
          className='text'
          >{room.producerId}</p>
        </div>
          <IoMdClose style={{fontSize: "2vw", fontWeight: "bold"}} />
      </div>
    );
  })}
  </div>
    </div>
  )
}
