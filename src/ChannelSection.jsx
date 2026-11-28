import React,{useId} from 'react';
import {Info} from 'lucide-react';
export function ChannelSection({title,note,children}){const id=useId();return <section className="card channel-section"><div className="channel-heading"><h2>{title}</h2>{note&&<span className="channel-info-wrap"><button type="button" className="channel-info" aria-label="More information" aria-describedby={id}><Info size={13}/></button><span className="channel-tooltip" role="tooltip" id={id}>{note}</span></span>}</div>{children}</section>;}
