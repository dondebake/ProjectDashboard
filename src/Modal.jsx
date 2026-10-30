import React,{useEffect,useRef} from 'react';
export default function Modal({title,onClose,children}) {
  const ref=useRef();
  useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Sluiten">×</button></div>{children}</dialog>;
}
