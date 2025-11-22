# mov to mp4 at 2x speed
ffmpeg -i input.mov -c:v libx264 -preset medium -crf 23 -vf "setpts=0.5*PTS" -movflags +faststart output.mp4

# mov to mp4 at 2x speed, 720p
ffmpeg -i input.mov -c:v libx264 -preset medium -crf 23 -vf "scale=-1:720,setpts=0.5*PTS" -af "atempo=2.0" -movflags +faststart output_720p.mp4

# mov to mp4 at 2x speed, 720p (portrait)
ffmpeg -i input.mov -c:v libx264 -preset medium -crf 23 -vf "scale=720:-1,setpts=0.5*PTS" -af "atempo=2.0" -movflags +faststart output_720p_portrait.mp4

# mov to mp4, original speed, 720p
ffmpeg -i input.mov -c:v libx264 -preset medium -crf 23 -vf "scale=-1:720" -movflags +faststart output_720p.mp4

# mov to mp4, original seepd, 720p silent
ffmpeg -i input.mov -c:v libx264 -preset medium -crf 23 -vf "scale=-1:720" -an -movflags +faststart output_720p.mp4

# mov to mp4, original speed, 720p (portrait)
ffmpeg -i input.mov -c:v libx264 -preset medium -crf 23 -vf "scale=720:-1" -movflags +faststart output_720p_portrait.mp4

# bulk convert *.MOV to *.mp4
for f in *.MOV; do ffmpeg -i "$f" -c:v libx264 -preset medium -crf 23 -vf "scale=-1:720" -movflags +faststart "${f%.MOV}.mp4"; done

# bulk convert *.MOV to *.mp4, original size
for f in *.MOV; do ffmpeg -i "$f" -c:v libx264 -preset medium -crf 23 -movflags +faststart "${f%.MOV}.mp4"; done

# bulk convert *.MOV to *.mp4, original size, higher compression
for f in *.MOV; do ffmpeg -i "$f" -c:v libx264 -preset slow -crf 28 -movflags +faststart "${f%.MOV}.mp4"; done

# bulk convert *.m4a to *.mp3
for f in *.m4a; do ffmpeg -i "$f" -c:a libmp3lame -b:a 192k "${f%.m4a}.mp3"; done

