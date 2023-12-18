import React, {useState, useEffect, useRef} from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useNavigate, useParams } from 'react-router-dom';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import '../App.css';
import Helpers from '../Helpers/Helpers';

export default function ConsumerLink() {
  const { id } = useParams();
  const [roomName, setRoomName] = useState("")
  const [rooms, setRooms] = useState([])
  const [heading, setHeading] = useState("")
  const [description, setDescription] = useState("")
  const [videoDisplay, setVideoDisplay] = useState("none")
  const [videoElementDisplay, setVideoElementDisplay] = useState("none")
  const [otherElementDisplay, setOtherElementDisplay] = useState("flex")
  const [joinButtonDisplay, setJoinButtonDisplay] = useState("inline")
  const [exitButtonDisplay, setExitButtonDisplay] = useState("none")
  const [btnText, setBtnText] = useState("Join")
  const [dataObj, setDataObj] = useState()
  const navigate = useNavigate();
  const notyf = new Notyf();

    let socket;
    let rtpCapabilities;
    let device;
    let consumer;
    let consumerTransport;
    const remoteVideo = useRef(null);
  
    let params = {
      // mediasoup params
      encodings: [
        {
          rid: 'r0',
          maxBitrate: 100000,
          scalabilityMode: 'S1T3',
        },
        {
          rid: 'r1',
          maxBitrate: 300000,
          scalabilityMode: 'S1T3',
        },
        {
          rid: 'r2',
          maxBitrate: 900000,
          scalabilityMode: 'S1T3',
        },
      ],
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
      codecOptions: {
        videoGoogleStartBitrate: 1000
      }
    }
  
    useEffect(() => {
      socket = io(`https://127.0.0.1:8000/`);
      socket.on('connection-success', ({ socketId }) => {
        // console.log(socketId);
      });
      socket.on("producerDisconnected", (data)=>{
        // console.log(data)
        remoteVideo.current.srcObject = null
        notyf.success("Stream Has been Ended")
        window.location.reload();
      })
    }, [roomName]);

    useEffect(()=>{
      socket = io(`${Helpers.server}`);
      socket.on("newUser", (data)=>{
        setRooms(Object.values(data))
        // console.log("Rooms ",rooms)
        setDataObj(data)
      })
    }, [])
  

    const goConsume = () => {
      goConnect(false)
    }
    
    const goConnect = () => {
      device === undefined ? getRTPCapabilities() : goCreateTransport()
    }
    
    const goCreateTransport = () => {
       createRecvTransport()
    }

    const videoRef = useRef(null);

    const getRTPCapabilities = async ()=>{
        // make a request to the server for Router RTP Capabilities
        // see server's socket.on('getRtpCapabilities', ...)
        // the server sends back data object which contains rtpCapabilities
        try{
          socket.emit('getRtpCapabilities',{  broadcaster:false ,roomName }, (data) => {
            
            // we assign to local variable and will be used when
            // loading the client Device (see createDevice above)
            if(data == null){
              notyf.error("Stream Has been Ended or Doesn't exist")
            }
            if(data != null){
              console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
              rtpCapabilities = data.rtpCapabilities
              createDevice()
            }
          })
        }catch(error){
          console.log(error)
          // notyf.error("An Error Occurred")
        }
    }
  
    const createDevice = async () => {
      try {
        device = new mediasoupClient.Device()
    
        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
        // Loads the device with RTP capabilities of the Router (server side)
        await device.load({
          // see getRtpCapabilities() below
          routerRtpCapabilities: rtpCapabilities
        })
    
        console.log('RTP Capabilities', device.rtpCapabilities)
        goCreateTransport()
      } catch (error) {
        notyf.error("An Error Occured, Try Again")
        console.log(error)
        if (error.name === 'UnsupportedError')
          console.warn('browser not supported')
          notyf.error("Your Browser Doesn't support Stream")
      }
    }
      
      const createRecvTransport = async () => {
        // see server's socket.on('consume', sender?, ...)
        // this is a call from Consumer, so sender = false
        await socket.emit('createWebRtcTransport', { sender: false }, ({ params }) => {
          // The server sends back params needed 
          // to create Send Transport on the client side
          if (params.error) {
            notyf.error("An Error Occured, Try Again")
            console.log(params.error)
            return
          }
      
          console.log("Create Web RTC transport ",params)
      
          // creates a new WebRTC Transport to receive media
          // based on server's consumer transport params
          // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-createRecvTransport
          consumerTransport = device.createRecvTransport(params)
      
          // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
          // this event is raised when a first call to transport.produce() is made
          // see connectRecvTransport() below
          consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-recv-connect', ...)
              await socket.emit('transport-recv-connect', {
                dtlsParameters,
              })
      
              // Tell the transport that parameters were transmitted.
              callback()
            } catch (error) {
              notyf.error("An Error Occured, Try Again")
              console.log(error)
              // Tell the transport that something was wrong
              errback(error)
            }
          })
          connectRecvTransport()
        })
      }

      
      const connectRecvTransport = async () => {
        // for consumer, we need to tell the server first
        // to create a consumer based on the rtpCapabilities and consume
        // if the router can consume, it will send back a set of params as below
        await socket.emit('consume', {
          rtpCapabilities: device.rtpCapabilities,
        }, async ({ params }) => {
          if (params.error) {
            notyf.error("Error Occured While Playing Video")
            console.log('Cannot Consume')
            return
          }
      
          console.log("Consume",params)
          // then consume with the local consumer transport
          // which creates a consumer
          consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
          })
      
          // destructure and retrieve the video track from the producer
          setVideoDisplay("block")
          setJoinButtonDisplay("none")
          setExitButtonDisplay("inline")
          setVideoElementDisplay("block")
          setOtherElementDisplay("none")
          const { track } = consumer
          console.log(track)
          remoteVideo.current.srcObject = new MediaStream([track])
      
          // the server consumer started with media paused
          // so we need to inform the server to resume
          socket.emit('consumer-resume')
        })
      }

      const joinRoom = () => {
        setRoomName(`${id}`)
        setHeading(`${id}`)
        let desc = dataObj[id].description;
        // console.log(dataObj[id])
        setDescription(desc)
        setBtnText("Play")
        let b = 0
        if(b <= 1){
          goConsume();
          b++;
        }else{
          goConsume();
        }
      }

      const exitRoom = ()=>{
        navigate("/");
      }
      

  return (
    <div style={{width:"100%", height: "100vh"}} className='d-flex flex-row justify-content-center align-items-center mx-auto pt-2'>
      
      <div className='card blur fullWidthMobile centered-row m-2 p-2' 
      style={{width: "70%", height: "70vh",boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)", backgroundColor: "rgb(255,255,255,0.4)"}}>
    <h1 className='heading displayOnlyMobileScreen'>{heading}</h1>
    <video 
    id='remoteVideo' 
    ref={remoteVideo} 
    autoPlay playsInline 
    style={{
    display: videoElementDisplay,
    maxWidth: "100%",
    height: "70vh",
    borderRadius: '20px'}} controls></video>

    <button onClick={joinRoom}  
    style={{display: joinButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none"}}
    className='btn btn-success m-2 p-2 w-25' >{btnText}</button>
    <button 
    className='btn btn-success p-2 m-2 mx-auto displayOnlyMobileScreen' 
    onClick={exitRoom}
    style={{display: exitButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none"}}
    >Stop Stream</button>
    </div>

    <div 
    style={{width: "30%", height: "70vh",boxShadow: "5px 5px 10px rgba(0, 0, 0, 0.3)", backgroundColor: "rgb(255,255,255,0.4)"}}
    className='card blur centered-row m-2 p-2 noDisplayMobileScreen'>
    <h1 className='heading'>{heading}</h1>
    <p className='text'>{description}</p>
    <button 
    className='btn btn-success p-2 m-2 mx-auto' 
    onClick={exitRoom}
    style={{display: exitButtonDisplay, background: "linear-gradient(90deg, hsla(318, 44%, 51%, 1), hsla(347, 94%, 48%, 1))", border: "none"}}
    >Stop Stream</button>
    </div>

    </div>
  )}