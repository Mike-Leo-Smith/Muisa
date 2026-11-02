import math

def metrics(ref,pred):
 assert len(ref)==len(pred)
 voiced=sum(v is not None for v in ref);unvoiced=len(ref)-voiced;accepted=correct=covered=false=octave=0
 for r,p in zip(ref,pred):
  if p is None:continue
  assert math.isfinite(p);accepted+=1
  if r is None:false+=1;continue
  covered+=1;e=abs(p-r)*100;correct+=e<=50;octave+=e>=1150 and abs(e-round(e/1200)*1200)<=50
 return dict(voicedFrames=voiced,unvoicedFrames=unvoiced,acceptedFrames=accepted,coveredFrames=covered,correct50Frames=correct,falseAlarmFrames=false,octaveErrors=octave,rpa50=correct/voiced if voiced else None,coverage=covered/voiced if voiced else None,acceptedPrecision50=correct/accepted if accepted else None,voicingFalseAlarm=false/unvoiced if unvoiced else None,octaveErrorRate=octave/voiced if voiced else None)

def macro(rows):
 result={'recordingCount':len(rows)}
 for key in ['rpa50','coverage','acceptedPrecision50','voicingFalseAlarm','octaveErrorRate']:
  values=[r[key] for r in rows if r[key] is not None];result[key]={'mean':sum(values)/len(values) if values else None,'definedRecordings':len(values)}
 return result
