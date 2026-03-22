import express from 'express';
import multer from 'multer';
import { supabaseServerClient } from '../lib/supabase';

const router = express.Router();
const upload = multer();

router.post('/avatar', upload.single('file'), async (req, res) => {
	// @ts-ignore
	const file = req.file;
	if (!file) return res.status(400).send('No file');

	const fileName = `avatars/${Date.now()}-${file.originalname}`;

	const { data, error } = await supabaseServerClient.storage
		.from('avatars-bucket')
		.upload(fileName, file.buffer, { contentType: file.mimetype });

	if (error) return res.status(500).json({ error: error.message });

	const { data: publicUrlData } = supabaseServerClient.storage
		.from('avatars-bucket')
		.getPublicUrl(fileName);

	return res.json({ data, publicUrl: publicUrlData.publicUrl });
});

export default router;
